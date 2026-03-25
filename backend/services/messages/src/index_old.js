import express from "express";
import dotenv from "dotenv";
import pool from "./db/pool.js";
import jwt from "jsonwebtoken";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "http";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "change_me";

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

io.on("connection", async (socket) => {
  const uid = socket.userId;
  socket.join(`user:${uid}`);

  // Join all group rooms the user is a member of
  try {
    const groups = await pool.query(
      "SELECT groupid FROM groupmembers WHERE userid = $1",
      [uid]
    );
    groups.rows.forEach(row => {
      socket.join(`group:${row.groupid}`);
    });
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
      // Verify user is a member of this group
      const membership = await pool.query(
        "SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2",
        [groupid, uid]
      );
      if (membership.rowCount === 0) {
        if (typeof ack === "function") ack({ error: "not a member" });
        return;
      }

      // Insert message
      const r = await pool.query(
        `INSERT INTO messages (groupid, senderid, content, status) 
         VALUES ($1, $2, $3, $4) 
         RETURNING messageid, groupid, senderid, content, timestamp, status`,
        [groupid, uid, content, "sent"]
      );
      const saved = r.rows[0];

      // Update group's last message timestamp
      await pool.query(
        "UPDATE groups SET lastmessagetimestamp = $1 WHERE groupid = $2",
        [saved.timestamp, groupid]
      );

      // Fetch sender info to include in broadcast
      const userInfo = await pool.query(
        "SELECT username, profilepicture, phonenumber FROM users WHERE userid = $1",
        [uid]
      );
      
      // Get all members to check contact status for each
      const members = await pool.query(
        "SELECT userid FROM groupmembers WHERE groupid = $1",
        [groupid]
      );
      
      const messageWithUser = {
        ...saved,
        username: userInfo.rows[0]?.username,
        profilepicture: userInfo.rows[0]?.profilepicture,
        phonenumber: userInfo.rows[0]?.phonenumber
      };

      // Send to each member with their specific contact status
      for (const member of members.rows) {
        const isContact = await pool.query(
          "SELECT 1 FROM contacts WHERE userid = $1 AND contactuserid = $2",
          [member.userid, uid]
        );
        
        const messageForMember = {
          ...messageWithUser,
          is_contact: isContact.rowCount > 0
        };
        
        io.to(`user:${member.userid}`).emit("groupMessage", messageForMember);
      }

      if (typeof ack === "function") ack({ ok: true, message: messageWithUser });
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
    // optional cleanup/logging
  });
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
    // Verify user is a member
    const membership = await pool.query(
      "SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2",
      [groupid, req.user]
    );
    if (membership.rowCount === 0) {
      return res.status(403).json({ error: "not a member" });
    }

    const r = await pool.query(
      `INSERT INTO messages (groupid, senderid, content, status) 
       VALUES ($1, $2, $3, $4) 
       RETURNING messageid, groupid, senderid, timestamp, status`,
      [groupid, req.user, content, "sent"]
    );
    
    // Update group's last message timestamp
    await pool.query(
      "UPDATE groups SET lastmessagetimestamp = NOW() WHERE groupid = $1",
      [groupid]
    );
    
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a group (moved to groups service, keeping for backward compat)
app.get("/messages/history", verifyToken, async (req, res) => {
  const { groupid } = req.query;
  if (!groupid) return res.status(400).json({ error: "missing groupid" });
  try {
    // Verify membership
    const membership = await pool.query(
      "SELECT 1 FROM groupmembers WHERE groupid = $1 AND userid = $2",
      [groupid, req.user]
    );
    if (membership.rowCount === 0) {
      return res.status(403).json({ error: "not a member" });
    }

    const r = await pool.query(
      `SELECT m.messageid, m.groupid, m.senderid, m.content, m.timestamp, m.status,
              u.username, u.profilepicture
       FROM messages m
       JOIN users u ON m.senderid = u.userid
       WHERE m.groupid = $1
       ORDER BY m.timestamp`,
      [groupid]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update status (only own messages)
app.patch("/messages/:id/status", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "missing" });
  try {
    const r = await pool.query(
      "UPDATE messages SET status=$1 WHERE messageid=$2 AND receiverid=$3",
      [status, id, req.user]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

