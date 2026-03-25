import express from "express";
import dotenv from "dotenv";
import pool from "./db/pool.js";
import jwt from "jsonwebtoken";
import cors from "cors";
import { metricsMiddleware, metricsEndpoint } from '../common/metrics.js';

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// Prometheus metrics middleware
app.use(metricsMiddleware);

const JWT_SECRET = process.env.JWT_SECRET || "change_me";
const MESSAGES_SERVICE_URL = process.env.MESSAGES_SERVICE_URL || 'http://localhost:8084';

// JWT middleware
function verifyToken(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: "missing token" });
  try {
    const token = h.split(" ")[1] || h;
    req.user = jwt.verify(token, JWT_SECRET).sub;
    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}

// Get all groups/conversations for the authenticated user (both direct and group chats)
app.get("/groups", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.GroupID, g.GroupName, g.IsDirectChat, 
              g.LastMessageTimestamp,
              COUNT(DISTINCT gm.UserID) as member_count
       FROM Groups g
       JOIN GroupMembers gm ON g.GroupID = gm.GroupID
       WHERE g.GroupID IN (
         SELECT GroupID FROM GroupMembers WHERE UserID = $1
       )
       GROUP BY g.GroupID
       ORDER BY g.LastMessageTimestamp DESC NULLS LAST`,
      [req.user]
    );
    
    // For direct chats, fetch the other user's info from auth-users service
    const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:8081';
    const CONTACTS_SERVICE_URL = process.env.CONTACTS_SERVICE_URL || 'http://localhost:8083';

    let unreadCounts = {};
    try {
      const unreadRes = await fetch(`${MESSAGES_SERVICE_URL}/messages/unread-counts`, {
        headers: { 'Authorization': req.headers.authorization }
      });
      if (unreadRes.ok) {
        unreadCounts = await unreadRes.json();
      }
    } catch (e) {
      console.error("[Groups] Failed to fetch unread counts:", e.message);
    }
    const getUnread = (gid) =>
      Number(unreadCounts[String(gid)] ?? unreadCounts[gid] ?? 0);
    
    // Fetch last message for each group
    const lastMessages = {};
    const lastMessageTimestamps = {};
    await Promise.all(result.rows.map(async (group) => {
      try {
        const messagesRes = await fetch(
          `${MESSAGES_SERVICE_URL}/messages?groupid=${group.groupid}&limit=1`,
          { headers: { 'Authorization': req.headers.authorization } }
        );
        if (messagesRes.ok) {
          const messages = await messagesRes.json();
          if (Array.isArray(messages) && messages.length > 0) {
            lastMessages[group.groupid] = messages[0].content || '';
            lastMessageTimestamps[group.groupid] = messages[0].timestamp || null;
          }
        }
      } catch (e) {
        console.error(`[Groups] Failed to fetch last message for group ${group.groupid}:`, e.message);
      }
    }));
    
    const groups = await Promise.all(result.rows.map(async (group) => {
      if (group.isdirectchat) {
        // Get the other user ID
        const otherUserQuery = await pool.query(
          `SELECT UserID
           FROM GroupMembers
           WHERE GroupID = $1 AND UserID != $2
           LIMIT 1`,
          [group.groupid, req.user]
        );
        
        if (otherUserQuery.rows.length > 0) {
          const otherUserId = otherUserQuery.rows[0].userid;
          console.log(`[Groups] Fetching user ${otherUserId} from ${AUTH_SERVICE_URL}/users/${otherUserId}`);
          
          try {
            // Fetch user details from auth-users service
            const userRes = await fetch(`${AUTH_SERVICE_URL}/users/${otherUserId}`, {
              headers: { 'Authorization': req.headers.authorization }
            });
            
            console.log(`[Groups] User fetch response status: ${userRes.status}`);
            
            if (userRes.ok) {
              const otherUser = await userRes.json();
              console.log(`[Groups] Fetched user: ${otherUser.username}`);
              
              // Check if this user is in contacts
              let isContact = true; // Default to true to show name
              try {
                const contactsRes = await fetch(`${CONTACTS_SERVICE_URL}/contacts`, {
                  headers: { 'Authorization': req.headers.authorization }
                });
                if (contactsRes.ok) {
                  const contacts = await contactsRes.json();
                  isContact = Array.isArray(contacts) && contacts.some(c => Number(c.contactuserid) === Number(otherUserId));
                  console.log(`[Groups] User ${otherUserId} is contact: ${isContact}`);
                }
              } catch (e) {
                console.error(`[Groups] Error checking contacts:`, e.message);
              }
              
              return {
                ...group,
                display_name: otherUser.username,
                display_picture: otherUser.profilepicture,
                other_user: otherUser,
                is_contact: isContact,
                unread_count: getUnread(group.groupid),
                last_message: lastMessages[group.groupid] || '',
                last_message_timestamp: lastMessageTimestamps[group.groupid] || group.lastmessagetimestamp
              };
            } else {
              const errorText = await userRes.text();
              console.error(`[Groups] Failed to fetch user ${otherUserId}: ${userRes.status} - ${errorText}`);
            }
          } catch (e) {
            console.error(`[Groups] Error fetching user ${otherUserId}:`, e.message);
          }
        }
        
        // Fallback for direct chats when user fetch fails
        return {
          ...group,
          display_name: `User ${otherUserQuery.rows[0]?.userid || 'Unknown'}`,
          display_picture: null,
          is_contact: false,
          unread_count: getUnread(group.groupid),
          last_message: lastMessages[group.groupid] || '',
          last_message_timestamp: lastMessageTimestamps[group.groupid] || group.lastmessagetimestamp
        };
      }
      return {
        ...group,
        display_name: group.groupname || 'Unnamed Group',
        display_picture: null,
        unread_count: getUnread(group.groupid),
        last_message: lastMessages[group.groupid] || '',
        last_message_timestamp: lastMessageTimestamps[group.groupid] || group.lastmessagetimestamp
      };
    }));
    
    // Sort groups by last message timestamp (most recent first)
    groups.sort((a, b) => {
      const timeA = a.last_message_timestamp ? new Date(a.last_message_timestamp).getTime() : 0;
      const timeB = b.last_message_timestamp ? new Date(b.last_message_timestamp).getTime() : 0;
      return timeB - timeA; // Descending order (most recent first)
    });
    
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a specific group (with pagination)
app.get("/groups/:id/messages", verifyToken, async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  
  try {
    // Verify user is a member of this group
    const membership = await pool.query(
      "SELECT 1 FROM GroupMembers WHERE GroupID = $1 AND UserID = $2",
      [id, req.user]
    );
    if (membership.rowCount === 0) {
      return res.status(403).json({ error: "not a member of this group" });
    }

    // Fetch messages from messages service
    const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:8081';
    const CONTACTS_SERVICE_URL = process.env.CONTACTS_SERVICE_URL || 'http://localhost:8083';
    
    try {
      const messagesRes = await fetch(
        `${MESSAGES_SERVICE_URL}/messages?groupid=${id}&limit=${limit}&offset=${offset}`,
        { headers: { 'Authorization': req.headers.authorization } }
      );
      
      if (!messagesRes.ok) {
        console.error(`[Groups] Failed to fetch messages: ${messagesRes.status}`);
        return res.json([]);
      }
      
      const messages = await messagesRes.json();
      
      // Enrich messages with user data
      // First, get all unique sender IDs
      const senderIds = [...new Set(messages.map(m => m.senderid))];
      
      // Fetch user data for all senders
      const usersMap = {};
      await Promise.all(senderIds.map(async (senderId) => {
        try {
          const userRes = await fetch(`${AUTH_SERVICE_URL}/users/${senderId}`, {
            headers: { 'Authorization': req.headers.authorization }
          });
          if (userRes.ok) {
            usersMap[senderId] = await userRes.json();
          }
        } catch (e) {
          console.error(`[Groups] Error fetching user ${senderId}:`, e.message);
        }
      }));
      
      // Fetch contacts once
      let contacts = [];
      try {
        const contactsRes = await fetch(`${CONTACTS_SERVICE_URL}/contacts`, {
          headers: { 'Authorization': req.headers.authorization }
        });
        if (contactsRes.ok) {
          contacts = await contactsRes.json();
        }
      } catch (e) {
        console.error(`[Groups] Error fetching contacts:`, e.message);
      }
      
      // Enrich each message with user data and contact status
      const enrichedMessages = messages.map(msg => {
        const user = usersMap[msg.senderid];
        const isContact = Array.isArray(contacts) && contacts.some(c => Number(c.contactuserid) === Number(msg.senderid));
        
        return {
          ...msg,
          username: user?.username || `User ${msg.senderid}`,
          is_contact: isContact,
          is_read: Boolean(msg.is_read),
          read_at: msg.readat || null
        };
      });
      
      res.json(enrichedMessages);
    } catch (e) {
      console.error(`[Groups] Error calling messages service:`, e.message);
      res.json([]);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create group (creator becomes a member automatically)
// For direct chats: set isdirectchat=true, groupname=null, exactly 2 members
// For group chats: set isdirectchat=false, groupname required, 2+ members
app.post("/groups", verifyToken, async (req, res) => {
  const { groupname, members, isdirectchat } = req.body;
  const isDirectChat = isdirectchat === true;
  
  if (!isDirectChat && !groupname) {
    return res.status(400).json({ error: "groupname required for group chats" });
  }
  
  try {
    // Check if direct chat already exists between these users
    if (isDirectChat && members && members.length === 1) {
      const existingChat = await pool.query(
        `SELECT g.GroupID 
         FROM Groups g
         JOIN GroupMembers gm1 ON g.GroupID = gm1.GroupID
         JOIN GroupMembers gm2 ON g.GroupID = gm2.GroupID
         WHERE g.IsDirectChat = true
         AND gm1.UserID = $1 AND gm2.UserID = $2
         AND (SELECT COUNT(*) FROM GroupMembers WHERE GroupID = g.GroupID) = 2`,
        [req.user, members[0]]
      );
      
      if (existingChat.rowCount > 0) {
        return res.json({ groupid: existingChat.rows[0].groupid, existing: true });
      }
    }
    
    // Insert group row
    const r = await pool.query(
      "INSERT INTO Groups (GroupName, IsDirectChat) VALUES ($1, $2) RETURNING GroupID",
      [isDirectChat ? null : groupname, isDirectChat]
    );
    const groupid = r.rows[0].groupid;

    // Ensure creator is added and dedupe members
    const memberIds = new Set((members || []).map((m) => Number(m)).filter(Boolean));
    memberIds.add(Number(req.user));

    // Validate direct chat has exactly 2 members
    if (isDirectChat && memberIds.size !== 2) {
      await pool.query("DELETE FROM Groups WHERE GroupID = $1", [groupid]);
      return res.status(400).json({ error: "direct chats must have exactly 2 members" });
    }

    // Insert members (creator gets admin role for group chats)
    const insertPromises = Array.from(memberIds).map((uid) =>
      pool.query(
        "INSERT INTO GroupMembers (GroupID, UserID, Role) VALUES ($1, $2, $3)",
        [groupid, uid, !isDirectChat && uid === Number(req.user) ? 'admin' : 'member']
      )
    );
    await Promise.all(insertPromises);

    // Notify other members via Socket.IO (not the creator)
    const otherMembers = Array.from(memberIds).filter(uid => uid !== Number(req.user));
    
    await Promise.all(otherMembers.map(async (uid) => {
      try {
        await fetch(`${MESSAGES_SERVICE_URL}/notify/added-to-group`, {
          method: 'POST',
          headers: {
            'Authorization': req.headers.authorization,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userid: uid, groupid })
        });
        console.log(`[Groups] Notified user ${uid} about group ${groupid}`);
      } catch (e) {
        console.error(`[Groups] Failed to notify user ${uid}:`, e.message);
      }
    }));

    res.status(201).json({ groupid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add member (requester must be an existing group member)
app.post("/groups/:id/members", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { userid } = req.body;
  if (!userid) return res.status(400).json({ error: "missing userid" });
  try {
    // check requester is group member
    const check = await pool.query(
      "SELECT 1 FROM GroupMembers WHERE GroupID=$1 AND UserID=$2",
      [id, req.user]
    );
    if (check.rowCount === 0) return res.status(403).json({ error: "forbidden" });

    // prevent duplicate membership
    const exists = await pool.query(
      "SELECT 1 FROM GroupMembers WHERE GroupID=$1 AND UserID=$2",
      [id, userid]
    );
    if (exists.rowCount > 0) return res.status(409).json({ error: "already a member" });

    const r = await pool.query(
      "INSERT INTO GroupMembers (GroupID, UserID) VALUES ($1,$2) RETURNING GroupMemberID",
      [id, userid]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get group members (requester must be a member)
app.get("/groups/:id/members", verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const m = await pool.query(
      "SELECT 1 FROM GroupMembers WHERE GroupID=$1 AND UserID=$2",
      [id, req.user]
    );
    if (m.rowCount === 0) return res.status(403).json({ error: "forbidden" });

    const r = await pool.query(
      "SELECT GroupMemberID, UserID FROM GroupMembers WHERE GroupID=$1",
      [id]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// METRICS ENDPOINT
// ========================================

app.get('/metrics', metricsEndpoint);

// ========================================
// HEALTH CHECK ENDPOINT
// ========================================

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'groups' });
});

app.listen(8085, () => console.log("groups service listening on 8085"));
