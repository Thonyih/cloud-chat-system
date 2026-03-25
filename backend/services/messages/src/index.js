import express from "express";
import dotenv from "dotenv";
import pool from "./db/pool.js";
import jwt from "jsonwebtoken";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "http";
import { metricsMiddleware, metricsEndpoint, messagesSentCounter, messagesReceivedCounter, onlineUsersGauge } from '../common/metrics.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Prometheus metrics middleware
app.use(metricsMiddleware);

const JWT_SECRET = process.env.JWT_SECRET || "change_me";
const GROUPS_SERVICE_URL = process.env.GROUPS_SERVICE_URL || 'http://localhost:8085';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:8081';
const CONTACTS_SERVICE_URL = process.env.CONTACTS_SERVICE_URL || 'http://localhost:8083';

const httpServer = createServer(app);

// create Socket.IO server (configure CORS as needed)
const io = new Server(httpServer, {
  cors: {
    origin: "*", // lock this to your frontend origin in production
    methods: ["GET", "POST"],
  },
});

// socket auth & join room
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error("missing token"));
    const userId = jwt.verify(token.split(" ")[1] || token, JWT_SECRET).sub;
    socket.userId = userId;
    return next();
  } catch (err) {
    return next(new Error("invalid token"));
  }
});

// Track connected users for metrics
const connectedUsers = new Set();

function updateOnlineUsersMetric() {
  onlineUsersGauge.set(connectedUsers.size);
}

const toBearer = (token = "") =>
  token && token.startsWith("Bearer ") ? token : `Bearer ${token}`;

async function fetchGroupMemberIds(groupid, authHeader) {
  const res = await fetch(`${GROUPS_SERVICE_URL}/groups/${groupid}/members`, {
    headers: { Authorization: authHeader },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch group members for ${groupid}: ${res.status}`);
  }
  const members = await res.json();
  return members
    .map((m) => Number(m.userid ?? m.userId))
    .filter((n) => Number.isFinite(n));
}

async function fetchUsername(userId, authHeader) {
  try {
    const userRes = await fetch(`${AUTH_SERVICE_URL}/users/${userId}`, {
      headers: { Authorization: authHeader },
    });
    if (userRes.ok) {
      const user = await userRes.json();
      return user.username || `User ${userId}`;
    }
  } catch (e) {
    console.error("Failed to fetch user:", e);
  }
  return `User ${userId}`;
}

async function recordReadEntries(messageId, senderId, groupid, authHeader, timestamp) {
  const memberIds = await fetchGroupMemberIds(groupid, authHeader);

  await Promise.all(
    memberIds.map((memberId) => {
      if (memberId === senderId) {
        return pool.query(
          `INSERT INTO MessageReads (MessageID, UserID, ReadAt)
           VALUES ($1, $2, $3)
           ON CONFLICT (MessageID, UserID) DO UPDATE SET ReadAt = EXCLUDED.ReadAt`,
          [messageId, memberId, timestamp || new Date()]
        );
      }

      return pool.query(
        `INSERT INTO MessageReads (MessageID, UserID, ReadAt)
         VALUES ($1, $2, NULL)
         ON CONFLICT (MessageID, UserID) DO NOTHING`,
        [messageId, memberId]
      );
    })
  );

  return memberIds;
}

async function notifyUnread(message, memberIds) {
  const senderId = Number(message.senderid ?? message.senderId);
  const recipients = memberIds.filter((id) => id !== senderId);
  recipients.forEach((uid) => {
    io.to(`user:${uid}`).emit("messageUnread", {
      groupid: message.groupid,
      messageid: message.messageid,
    });
  });
}

async function enrichAndBroadcastMessage(saved, senderId, authHeader) {
  let memberIds = [];
  try {
    memberIds = await recordReadEntries(
      saved.messageid,
      senderId,
      saved.groupid,
      authHeader,
      saved.timestamp
    );
  } catch (err) {
    console.error("Failed to record read entries:", err);
    memberIds = [];
  }

  const username = await fetchUsername(senderId, authHeader);

  const messageData = {
    ...saved,
    senderid: senderId,
    username,
    is_contact: true,
  };

  // Broadcast to the group
  io.to(`group:${saved.groupid}`).emit("groupMessage", messageData);

  // Notify individual recipients about unread message
  if (memberIds.length > 0) {
    await notifyUnread(messageData, memberIds);
  }

  return messageData;
}

io.on("connection", async (socket) => {
  const uid = socket.userId;
  socket.join(`user:${uid}`);
  
  // Track connected user
  connectedUsers.add(uid);
  updateOnlineUsersMetric();

  // Join all group rooms the user is a member of (call groups service)
  try {
    const groupsRes = await fetch(`${GROUPS_SERVICE_URL}/groups`, {
      headers: { 'Authorization': `Bearer ${socket.handshake.auth.token}` }
    });
    if (groupsRes.ok) {
      const groups = await groupsRes.json();
      groups.forEach(g => {
        socket.join(`group:${g.groupid}`);
      });
    }
  } catch (err) {
    console.error("Failed to join group rooms:", err);
  }

  // send a welcome (optional)
  socket.emit("connected", { userId: uid });

  // Handle outgoing group message from client
  socket.on("sendGroupMessage", async (payload, ack) => {
    // payload: { groupid, content }
    const { groupid, content } = payload || {};
    if (!groupid || !content) {
      if (typeof ack === "function") ack({ error: "missing groupid or content" });
      return;
    }
    try {
      // Insert message
      const r = await pool.query(
        `INSERT INTO Messages (GroupID, SenderID, Content, Status) 
         VALUES ($1, $2, $3, $4) 
         RETURNING MessageID, GroupID, SenderID, Content, Timestamp, Status`,
        [groupid, uid, content, "sent"]
      );
      const saved = r.rows[0];

      // Increment messages sent counter
      messagesSentCounter.inc({ group_id: groupid.toString() });

      // Update group's last message timestamp (call groups service)
      const authHeader = toBearer(socket.handshake.auth.token);
      await fetch(`${GROUPS_SERVICE_URL}/groups/${groupid}/update-timestamp`, {
        method: 'PATCH',
        headers: { 
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ timestamp: saved.timestamp })
      }).catch(e => console.error('Failed to update group timestamp:', e));

      const messageData = await enrichAndBroadcastMessage(saved, uid, authHeader);

      if (typeof ack === "function") ack({ ok: true, message: messageData });
    } catch (err) {
      console.error("sendGroupMessage error:", err);
      if (typeof ack === "function") ack({ error: err.message });
    }
  });

  // Handle user joining a new group (e.g., when added to group)
  socket.on("joinGroup", (groupid) => {
    socket.join(`group:${groupid}`);
  });

  socket.on("disconnect", () => {
    // Remove user from connected users set
    connectedUsers.delete(uid);
    updateOnlineUsersMetric();
  });
});

// ========================================
// METRICS ENDPOINT
// ========================================

app.get('/metrics', metricsEndpoint);

// ========================================
// HEALTH CHECK ENDPOINT
// ========================================

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'messages' });
});

// start the http server instead of app.listen
httpServer.listen(8084, () =>
  console.log("messages service (http + socket.io) listening on 8084")
);

// graceful shutdown
process.on("SIGINT", async () => {
  console.log("shutting down messages service...");
  io.close();
  httpServer.close(() => process.exit(0));
});


// JWT middleware
function verifyToken(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: "missing token" });
  try {
    req.user = jwt.verify(h.split(" ")[1], JWT_SECRET).sub;
    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}

// Send a message to a group (alternative to WebSocket)
app.post("/messages", verifyToken, async (req, res) => {
  const { groupid, content } = req.body;
  if (!groupid || !content)
    return res.status(400).json({ error: "missing groupid or content" });
  try {
    const r = await pool.query(
      `INSERT INTO Messages (GroupID, SenderID, Content, Status) 
       VALUES ($1, $2, $3, $4) 
       RETURNING MessageID, GroupID, SenderID, Content, Timestamp, Status`,
      [groupid, req.user, content, "sent"]
    );
    const saved = r.rows[0];
    const authHeader = req.headers.authorization || "";
    const bearerHeader = toBearer(authHeader);

    await fetch(`${GROUPS_SERVICE_URL}/groups/${groupid}/update-timestamp`, {
      method: "PATCH",
      headers: {
        Authorization: bearerHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ timestamp: saved.timestamp }),
    }).catch((e) =>
      console.error("Failed to update group timestamp:", e)
    );

    const messageData = await enrichAndBroadcastMessage(
      saved,
      Number(req.user),
      bearerHeader
    );
    res.status(201).json(messageData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a group
app.get("/messages", verifyToken, async (req, res) => {
  const { groupid } = req.query;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  
  if (!groupid) return res.status(400).json({ error: "missing groupid" });
  
  try {
    const r = await pool.query(
      `SELECT m.MessageID, m.GroupID, m.SenderID, m.Content, m.Timestamp, m.Status,
              mr.ReadAt,
              (mr.ReadAt IS NOT NULL) AS is_read
       FROM Messages m
       LEFT JOIN MessageReads mr 
         ON mr.MessageID = m.MessageID
        AND mr.UserID = $1
       WHERE m.GroupID = $2
       ORDER BY m.Timestamp DESC
       LIMIT $3 OFFSET $4`,
      [req.user, groupid, limit, offset]
    );
    res.json(r.rows.reverse()); // Return in chronological order
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark messages as read for the authenticated user within a group
app.patch("/messages/read", verifyToken, async (req, res) => {
  const { groupid } = req.body;
  if (!groupid) {
    return res.status(400).json({ error: "missing groupid" });
  }

  try {
    const updated = await pool.query(
      `UPDATE MessageReads
       SET ReadAt = NOW()
       WHERE UserID = $1
         AND MessageID IN (
           SELECT MessageID FROM Messages WHERE GroupID = $2
         )
         AND ReadAt IS NULL
       RETURNING MessageID`,
      [req.user, groupid]
    );

    const updatedIds = updated.rows.map((r) => r.messageid);
    
    // Increment messages received counter for each message marked as read
    if (updatedIds.length > 0) {
      messagesReceivedCounter.inc(updatedIds.length);
    }

    if (updatedIds.length > 0) {
      await pool.query(
        `UPDATE Messages m
         SET Status = 'read'
         WHERE m.GroupID = $1
           AND m.Status <> 'read'
           AND EXISTS (
             SELECT 1 FROM MessageReads mr WHERE mr.MessageID = m.MessageID
           )
           AND NOT EXISTS (
             SELECT 1 FROM MessageReads mr 
             WHERE mr.MessageID = m.MessageID
               AND mr.ReadAt IS NULL
           )`,
        [groupid]
      );

      io.to(`group:${groupid}`).emit("messagesRead", {
        groupid,
        userid: req.user,
        messageIds: updatedIds,
      });
    }

    res.json({ ok: true, updated: updatedIds.length });
  } catch (err) {
    console.error("mark read error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get unread counts per group for the authenticated user
app.get("/messages/unread-counts", verifyToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT m.GroupID, COUNT(*)::int AS unread
       FROM MessageReads mr
       JOIN Messages m ON mr.MessageID = m.MessageID
       WHERE mr.UserID = $1
         AND mr.ReadAt IS NULL
       GROUP BY m.GroupID`,
      [req.user]
    );

    const result = {};
    for (const row of r.rows) {
      result[row.groupid] = Number(row.unread);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Notify a user via Socket.IO (called by other services)
app.post("/notify/added-to-group", verifyToken, async (req, res) => {
  const { userid, groupid } = req.body;
  if (!userid || !groupid) {
    return res.status(400).json({ error: "missing userid or groupid" });
  }
  
  try {
    // Emit to the specific user's room
    io.to(`user:${userid}`).emit("addedToGroup", { groupid });
    console.log(`[Messages] Notified user ${userid} about being added to group ${groupid}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
