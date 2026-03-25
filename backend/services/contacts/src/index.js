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

// basic JWT middleware
function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "missing token" });
  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.sub; // user ID from token
    next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}

// get my contacts
app.get("/contacts", verifyToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ContactID, ContactUserID, Blocked
       FROM Contacts
       WHERE UserID = $1`,
      [req.user]
    );
    
    const contacts = r.rows;
    
    // Enrich contacts with user data from auth-users service
    const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:8081';
    
    const enrichedContacts = await Promise.all(contacts.map(async (contact) => {
      try {
        const userRes = await fetch(`${AUTH_SERVICE_URL}/users/${contact.contactuserid}`, {
          headers: { 'Authorization': req.headers.authorization }
        });
        
        if (userRes.ok) {
          const user = await userRes.json();
          return {
            ...contact,
            username: user.username,
            phonenumber: user.phonenumber,
            profilepicture: user.profilepicture,
            status: user.status
          };
        }
      } catch (e) {
        console.error(`[Contacts] Failed to fetch user ${contact.contactuserid}:`, e.message);
      }
      
      // Fallback if user fetch fails
      return contact;
    }));
    
    res.json(enrichedContacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// block/unblock contact
app.patch("/contacts/:contactid", verifyToken, async (req, res) => {
  const { contactid } = req.params;
  const { blocked } = req.body;
  try {
    const r = await pool.query(
      "UPDATE Contacts SET Blocked = $1 WHERE ContactID = $2 AND UserID = $3",
      [blocked, contactid, req.user]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// add contact by phone number (prevents duplicates, requires target user exist)
app.post("/contacts", verifyToken, async (req, res) => {
  const { phonenumber } = req.body;
  if (!phonenumber) return res.status(400).json({ error: "phonenumber required" });

  try {
    // Call auth-users service to find user by phone
    const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:8081';
    const authRes = await fetch(`${AUTH_SERVICE_URL}/users/by-phone?phone=${encodeURIComponent(phonenumber)}`, {
      headers: { 'Authorization': req.headers.authorization }
    });
    
    if (!authRes.ok) {
      if (authRes.status === 404) return res.status(404).json({ error: "user not found" });
      return res.status(500).json({ error: "failed to lookup user" });
    }
    
    const userData = await authRes.json();
    const contactUserId = Number(userData.userid);
    const me = Number(req.user);

    if (contactUserId === me) return res.status(400).json({ error: "cannot add yourself" });

    // check existing contact
    const exists = await pool.query(
      "SELECT 1 FROM Contacts WHERE UserID = $1 AND ContactUserID = $2 LIMIT 1",
      [me, contactUserId]
    );
    if (exists.rowCount > 0) return res.status(409).json({ error: "contact already exists" });

    // insert contact
    const insert = await pool.query(
      `INSERT INTO Contacts (UserID, ContactUserID, Blocked)
       VALUES ($1, $2, false) RETURNING ContactID, UserID, ContactUserID, Blocked`,
      [me, contactUserId]
    );

    res.status(201).json(insert.rows[0]);
  } catch (err) {
    console.error("POST /contacts error", err);
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
  res.status(200).json({ status: 'healthy', service: 'contacts' });
});

app.listen(8083, () => console.log("contacts service listening on 8083"));
