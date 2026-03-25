import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from './db/pool.js';
import { metricsMiddleware, metricsEndpoint, userRegistrationsCounter, userLoginsCounter, onlineUsersGauge } from '../common/metrics.js';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Prometheus metrics middleware
app.use(metricsMiddleware);

const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const PORT = process.env.PORT || 8081;

// ========================================
// JWT MIDDLEWARE
// ========================================

function verifyToken(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'missing token' });
  try {
    req.user = jwt.verify(h.split(' ')[1], JWT_SECRET).sub;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// ========================================
// AUTHENTICATION ENDPOINTS
// ========================================

// Register (simple, no validation)
app.post('/register', async (req, res) => {
  const { username, password, phoneNumber } = req.body;
  if (!username || !password || !phoneNumber) {
    return res.status(400).json({ error: 'missing username, password, or phoneNumber' });
  }
  
  try {
    // Check if phone number already exists
    const phoneCheck = await pool.query(
      'SELECT UserID FROM Users WHERE PhoneNumber = $1',
      [phoneNumber]
    );
    
    if (phoneCheck.rowCount > 0) {
      return res.status(409).json({ error: 'phone number already registered' });
    }
    
    // Check if username already exists
    const usernameCheck = await pool.query(
      'SELECT UserID FROM Users WHERE Username = $1',
      [username]
    );
    
    if (usernameCheck.rowCount > 0) {
      return res.status(409).json({ error: 'username already taken' });
    }
    
    const hash = await bcrypt.hash(password, 10);
    const q = `INSERT INTO Users (Username, PhoneNumber, Password) VALUES ($1,$2,$3) RETURNING UserID, Username, PhoneNumber`;
    const r = await pool.query(q, [username, phoneNumber, hash]);
    
    // Increment registration counter
    userRegistrationsCounter.inc();
    
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('Registration error:', err);
    // Handle unique constraint violations
    if (err.code === '23505') { // PostgreSQL unique violation error code
      if (err.constraint === 'users_phonenumber_unique' || err.detail?.includes('PhoneNumber')) {
        return res.status(409).json({ error: 'phone number already registered' });
      }
      if (err.constraint === 'users_username_unique' || err.detail?.includes('Username')) {
        return res.status(409).json({ error: 'username already taken' });
      }
    }
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const q = `SELECT UserID, Password FROM Users WHERE Username = $1`;
    const r = await pool.query(q, [username]);
    
    if (r.rowCount === 0) return res.status(401).json({ error: 'invalid credentials' });
    
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password);
    
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    
    // Increment login counter
    userLoginsCounter.inc();
    
    const token = jwt.sign({ sub: user.userid }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// USER MANAGEMENT ENDPOINTS
// ========================================

// Search users by phone number (for adding contacts)
// IMPORTANT: This must come BEFORE /users/:id to avoid route conflicts
app.get('/users/by-phone', verifyToken, async (req, res) => {
  const { phone } = req.query;
  
  if (!phone) return res.status(400).json({ error: 'phone parameter required' });
  
  try {
    const r = await pool.query(
      'SELECT UserID, Username, PhoneNumber, ProfilePicture, Status FROM Users WHERE PhoneNumber=$1',
      [phone]
    );
    
    if (r.rowCount === 0) return res.status(404).json({ error: 'user not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search users by username
app.get('/users', verifyToken, async (req, res) => {
  const { q } = req.query;
  
  try {
    const r = await pool.query(
      'SELECT UserID, Username, PhoneNumber, ProfilePicture, Status FROM Users WHERE Username ILIKE $1 LIMIT 50',
      [`%${q || ''}%`]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user by ID
// IMPORTANT: This must come AFTER /users/by-phone and /users to avoid conflicts
app.get('/users/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const r = await pool.query(
      'SELECT UserID, Username, PhoneNumber, ProfilePicture, Status, LastSeen FROM Users WHERE UserID=$1',
      [id]
    );
    
    if (r.rowCount === 0) return res.status(404).json({ error: 'user not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user status
app.patch('/users/me/status', verifyToken, async (req, res) => {
  const { status } = req.body;
  
  try {
    const r = await pool.query(
      'UPDATE Users SET Status=$1, LastSeen=CURRENT_TIMESTAMP WHERE UserID=$2 RETURNING UserID, Status',
      [status || null, req.user]
    );
    
    if (r.rowCount === 0) return res.status(404).json({ error: 'user not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update username
app.patch('/users/me/username', verifyToken, async (req, res) => {
  const { username } = req.body;
  
  if (!username) return res.status(400).json({ error: 'username required' });
  
  try {
    const r = await pool.query(
      'UPDATE Users SET Username=$1 WHERE UserID=$2 RETURNING UserID, Username',
      [username, req.user]
    );
    
    if (r.rowCount === 0) return res.status(404).json({ error: 'user not found' });
    
    // TODO: Notify other services to update denormalized data (if we add it back later)
    // This is where you'd call other services or publish an event
    
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update profile picture
app.patch('/users/me/picture', verifyToken, async (req, res) => {
  const { profilepicture } = req.body;
  
  try {
    const r = await pool.query(
      'UPDATE Users SET ProfilePicture=$1 WHERE UserID=$2 RETURNING UserID, ProfilePicture',
      [profilepicture || null, req.user]
    );
    
    if (r.rowCount === 0) return res.status(404).json({ error: 'user not found' });
    res.json(r.rows[0]);
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
  res.status(200).json({ status: 'healthy', service: 'auth-users' });
});

// ========================================
// START SERVER
// ========================================

// Update online users count periodically (every 30 seconds)
// Users are considered online if their LastSeen is within the last 5 minutes
async function updateOnlineUsersMetric() {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM Users 
       WHERE LastSeen > NOW() - INTERVAL '5 minutes'`
    );
    const count = parseInt(result.rows[0].count, 10);
    onlineUsersGauge.set(count);
  } catch (err) {
    console.error('Error updating online users metric:', err);
  }
}

// Initial update and then every 30 seconds
updateOnlineUsersMetric();
setInterval(updateOnlineUsersMetric, 30000);

app.listen(PORT, () => console.log(`auth-users service listening on ${PORT}`));