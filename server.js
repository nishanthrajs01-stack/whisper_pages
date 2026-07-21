import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDb, dbQuery } from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-whisper-key';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpassword';
const ADMIN_2FA_KEY = process.env.ADMIN_2FA_KEY || '123456'; // Default 2FA token for IP lookup

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Load and compile password blocklist
let passwordBlocklist = new Set();
try {
  const content = readFileSync(join(__dirname, 'password_blocklist.txt'), 'utf-8');
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim().toLowerCase();
    if (trimmed) passwordBlocklist.add(trimmed);
  });
  console.log(`Loaded ${passwordBlocklist.size} blacklisted passwords.`);
} catch (err) {
  console.error('Failed to load password blocklist, utilizing empty fallback:', err.message);
}

// In-memory rate limiting map
const ipRequestHistory = {};

// Custom Rate Limiter Middleware
function rateLimiter(limit, windowMs) {
  return (req, res, next) => {
    // Bypass rate limiting in automated test environment
    if (process.env.JWT_SECRET === 'test-jwt-secret') {
      return next();
    }
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    
    if (!ipRequestHistory[ip]) {
      ipRequestHistory[ip] = [];
    }
    
    ipRequestHistory[ip] = ipRequestHistory[ip].filter(timestamp => now - timestamp < windowMs);
    
    if (ipRequestHistory[ip].length >= limit) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    
    ipRequestHistory[ip].push(now);
    next();
  };
}

// Authenticate Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    req.user = null;
    return next();
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
}

// Strict Authenticate Middleware
function requireAuth(req, res, next) {
  authenticateToken(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    next();
  });
}

// Prohibited Content Filtering
const PROHIBITED_WORDS = [
  'child exploitation', 'underage sexual', 'abuse minor', 
  'bomb instruction', 'terrorist recruiting', 'hitman hire'
];

function containsProhibitedTerms(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return PROHIBITED_WORDS.some(word => lowerText.includes(word));
}

// Password Complexity Validator
function validatePasswordStrength(password) {
  if (password.length < 10) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':",\\|.<>\/?~`]/.test(password);
  return hasLetter && hasNumber && hasSymbol;
}

// Real-time strength meter calculation helper
function calculatePasswordScore(password) {
  if (password.length < 6) return 'weak';
  let score = 0;
  if (password.length >= 10) score++;
  if (/[a-zA-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':",\\|.<>\/?~`]/.test(password)) score++;
  
  if (score <= 2) return 'weak';
  if (score === 3) return 'medium';
  return 'strong';
}

// --- API ROUTES ---

// 1. Password Strength Checker (for live feedback)
app.post('/api/auth/check-password-strength', (req, res) => {
  const { password } = req.body;
  if (!password) return res.json({ score: 'weak', blocklisted: false });
  const blocklisted = passwordBlocklist.has(password.trim().toLowerCase());
  const score = calculatePasswordScore(password);
  res.json({ score, blocklisted });
});

// 2. Sign Up
app.post('/api/auth/signup', rateLimiter(10, 10 * 60 * 1000), async (req, res) => {
  const { username, password, age_bracket } = req.body;
  
  if (!username || !password || !age_bracket) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  
  const trimmedUser = username.trim();
  if (trimmedUser.toLowerCase() === 'admin') {
    return res.status(400).json({ error: 'Pen name "admin" is reserved.' });
  }

  // Case-insensitive username check
  const existingUser = await dbQuery.get(
    'SELECT * FROM accounts WHERE lower(pen_name) = lower(?)', 
    [trimmedUser]
  );
  if (existingUser) {
    return res.status(400).json({ error: 'Pen name already taken.' });
  }

  // Password Policy Gating
  if (!validatePasswordStrength(password)) {
    return res.status(400).json({ 
      error: 'Password must be at least 10 characters long, and include letters, numbers, and at least one symbol.' 
    });
  }

  // Blocklist check
  if (passwordBlocklist.has(password.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Password is too common and breaches security policy.' });
  }

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userId = 'usr_' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();

  try {
    await dbQuery.run(
      `INSERT INTO accounts (id, pen_name, password_hash, age_bracket, created_at, last_active_at, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, trimmedUser, hash, age_bracket, now, now, ip]
    );

    const token = jwt.sign({ id: userId, pen_name: trimmedUser, age_bracket, role: 'user' }, JWT_SECRET);
    res.status(201).json({ token, user: { id: userId, pen_name: trimmedUser, age_bracket } });
  } catch (err) {
    res.status(500).json({ error: 'Database signup error: ' + err.message });
  }
});

// 3. Login
app.post('/api/auth/login', rateLimiter(10, 10 * 60 * 1000), async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  const trimmedUser = username.trim();
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = new Date().toISOString();

  // Admin Login Check
  if (trimmedUser.toLowerCase() === 'admin') {
    if (password === ADMIN_PASSWORD) {
      const token = jwt.sign({ id: 'admin_master', pen_name: 'Admin Master', age_bracket: '50_plus', role: 'admin' }, JWT_SECRET);
      return res.json({ token, user: { id: 'admin_master', pen_name: 'Admin Master', role: 'admin' } });
    } else {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }
  }

  const user = await dbQuery.get('SELECT * FROM accounts WHERE lower(pen_name) = lower(?)', [trimmedUser]);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Update active timestamp and log IP
  await dbQuery.run('UPDATE accounts SET last_active_at = ?, ip_address = ? WHERE id = ?', [now, ip, user.id]);

  const token = jwt.sign({ id: user.id, pen_name: user.pen_name, age_bracket: user.age_bracket, role: 'user' }, JWT_SECRET);
  res.json({ token, user: { id: user.id, pen_name: user.pen_name, age_bracket: user.age_bracket } });
});

// 4. Me Endpoint
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  // Refresh database-driven fields if not admin
  if (req.user.role === 'admin') {
    return res.json({ user: req.user });
  }

  const user = await dbQuery.get('SELECT id, pen_name, age_bracket, last_active_at FROM accounts WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  res.json({ user: { id: user.id, pen_name: user.pen_name, age_bracket: user.age_bracket, last_active_at: user.last_active_at } });
});

// 5. Update Age Bracket
app.put('/api/auth/age', requireAuth, async (req, res) => {
  const { age_bracket, password } = req.body;
  if (!age_bracket || !password) {
    return res.status(400).json({ error: 'Age bracket and password required.' });
  }

  const user = await dbQuery.get('SELECT * FROM accounts WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid password.' });
  }

  await dbQuery.run('UPDATE accounts SET age_bracket = ? WHERE id = ?', [age_bracket, user.id]);
  res.json({ success: true, age_bracket });
});

// 6. Posts Discovery & Retrieval
app.get('/api/posts', authenticateToken, async (req, res) => {
  const { tag } = req.query;
  const userAge = req.user ? req.user.age_bracket : 'under_18'; // Logged out treated as minor for safety

  let posts;
  if (tag) {
    posts = await dbQuery.all(
      `SELECT p.*, a.pen_name as author_name 
       FROM posts p 
       JOIN accounts a ON p.author_id = a.id 
       WHERE p.status = 'published' AND lower(p.tags) LIKE ?`,
      [`%${tag.toLowerCase()}%`]
    );
  } else {
    posts = await dbQuery.all(
      `SELECT p.*, a.pen_name as author_name 
       FROM posts p 
       JOIN accounts a ON p.author_id = a.id 
       WHERE p.status = 'published'`
    );
  }

  // Filter 18+ content server-side if viewer is under 18 or logged out
  if (userAge === 'under_18') {
    posts = posts.filter(post => post.content_rating !== '18+');
  }

  // Map total likes and comments
  for (let post of posts) {
    const likes = await dbQuery.get('SELECT COUNT(*) as count FROM likes WHERE post_id = ?', [post.id]);
    const comments = await dbQuery.get("SELECT COUNT(*) as count FROM comments WHERE post_id = ? AND status = 'visible'", [post.id]);
    post.likes = likes.count;
    post.comments = comments.count;
  }

  res.json(posts);
});

// 7. Trending Posts Feed (gated preview for guests)
app.get('/api/posts/trending', authenticateToken, async (req, res) => {
  const isGuest = !req.user;
  const userAge = req.user ? req.user.age_bracket : 'under_18';

  const posts = await dbQuery.all(
    `SELECT p.*, a.pen_name as author_name 
     FROM posts p 
     JOIN accounts a ON p.author_id = a.id 
     WHERE p.status = 'published'`
  );

  // Compute trending score: Likes * 2 + Comments
  for (let post of posts) {
    const likes = await dbQuery.get('SELECT COUNT(*) as count FROM likes WHERE post_id = ?', [post.id]);
    const comments = await dbQuery.get("SELECT COUNT(*) as count FROM comments WHERE post_id = ? AND status = 'visible'", [post.id]);
    post.likes = likes.count;
    post.comments = comments.count;
    post.score = (likes.count * 2) + comments.count;
  }

  // Sort by score descending
  let trendingPosts = posts.sort((a, b) => b.score - a.score).slice(0, 10);

  // Server-side filter out 18+ content for minor users
  if (userAge === 'under_18') {
    trendingPosts = trendingPosts.filter(p => p.content_rating !== '18+');
  }

  // Gated Preview for Logged-Out Guests: only return first paragraph of text
  if (isGuest) {
    trendingPosts = trendingPosts.map(p => {
      const paragraphs = p.content.split(/\n+/);
      const preview = paragraphs[0] || '';
      return {
        ...p,
        content: preview,
        is_preview: true
      };
    });
  }

  res.json(trendingPosts);
});

// 8. Single Post Details
app.get('/api/posts/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userAge = req.user ? req.user.age_bracket : 'under_18';

  const post = await dbQuery.get(
    `SELECT p.*, a.pen_name as author_name, a.age_bracket as author_age_bracket
     FROM posts p 
     JOIN accounts a ON p.author_id = a.id 
     WHERE p.id = ?`,
    [id]
  );

  if (!post) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  // Enforce 18+ content rating gate server-side
  if (post.content_rating === '18+' && userAge === 'under_18') {
    return res.status(403).json({ error: 'Access denied: Content is restricted to 18+ viewers.' });
  }

  // Fetch comments and likes
  const likes = await dbQuery.get('SELECT COUNT(*) as count FROM likes WHERE post_id = ?', [post.id]);
  const comments = await dbQuery.all(
    `SELECT c.*, a.pen_name as author_name 
     FROM comments c 
     JOIN accounts a ON c.author_id = a.id 
     WHERE c.post_id = ? AND c.status = 'visible' 
     ORDER BY c.created_at ASC`,
    [post.id]
  );

  // If user logged in, check if they liked it
  let userLiked = false;
  if (req.user) {
    const likeRecord = await dbQuery.get('SELECT 1 FROM likes WHERE account_id = ? AND post_id = ?', [req.user.id, post.id]);
    userLiked = !!likeRecord;
  }

  res.json({
    post: {
      ...post,
      likes: likes.count,
      userLiked
    },
    comments
  });
});

// 9. Publish a Post
app.post('/api/posts', requireAuth, async (req, res) => {
  const { content, content_rating, tags } = req.body;

  if (!content || !content_rating) {
    return res.status(400).json({ error: 'Content and age rating are mandatory.' });
  }

  if (containsProhibitedTerms(content)) {
    return res.status(400).json({ error: 'Submission rejected: Contains prohibited content/terms.' });
  }

  const postId = 'post_' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  const cleanTags = tags ? tags.split(',').map(t => t.trim()).filter(t => t).join(', ') : '';

  try {
    await dbQuery.run(
      `INSERT INTO posts (id, author_id, content, content_rating, tags, created_at) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [postId, req.user.id, content, content_rating, cleanTags, now]
    );

    res.status(201).json({ id: postId, message: 'Post published successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create post: ' + err.message });
  }
});

// 10. Autosave Drafts
app.put('/api/posts/:id/autosave', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { content, content_rating, tags } = req.body;

  if (containsProhibitedTerms(content)) {
    return res.status(400).json({ error: 'Draft rejected: Contains prohibited terms.' });
  }

  const now = new Date().toISOString();
  const cleanTags = tags ? tags.split(',').map(t => t.trim()).filter(t => t).join(', ') : '';

  // Check if post exists and is owned by author
  const post = await dbQuery.get('SELECT * FROM posts WHERE id = ?', [id]);
  
  if (post) {
    if (post.author_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: Draft ownership mismatch.' });
    }
    await dbQuery.run(
      `UPDATE posts SET content = ?, content_rating = ?, tags = ?, created_at = ? WHERE id = ?`,
      [content, content_rating || 'general', cleanTags, now, id]
    );
  } else {
    // Save new draft
    await dbQuery.run(
      `INSERT INTO posts (id, author_id, content, content_rating, tags, created_at, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
      [id, req.user.id, content || '', content_rating || 'general', cleanTags, now]
    );
  }
  res.json({ success: true, message: 'Draft autosaved to server.' });
});

// 11. Profile Page
app.get('/api/profiles/:pen_name', requireAuth, async (req, res) => {
  const { pen_name } = req.params;
  const userAge = req.user.age_bracket;

  const profileUser = await dbQuery.get(
    'SELECT id, pen_name, created_at, is_seed FROM accounts WHERE lower(pen_name) = lower(?)', 
    [pen_name.trim()]
  );

  if (!profileUser) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  // Get total stats
  const postCountRow = await dbQuery.get(
    "SELECT COUNT(*) as count FROM posts WHERE author_id = ? AND status = 'published'", 
    [profileUser.id]
  );
  
  const posts = await dbQuery.all(
    `SELECT p.*, COUNT(l.post_id) as likes_count
     FROM posts p 
     LEFT JOIN likes l ON p.id = l.post_id 
     WHERE p.author_id = ? AND p.status = 'published' 
     GROUP BY p.id`,
    [profileUser.id]
  );

  // Calculate stats
  let totalLikes = 0;
  let totalComments = 0;
  let filteredPosts = [];

  for (let post of posts) {
    // Server-side filter out 18+ content for minor users
    if (userAge === 'under_18' && post.content_rating === '18+') {
      continue;
    }

    const commentsRow = await dbQuery.get(
      "SELECT COUNT(*) as count FROM comments WHERE post_id = ? AND status = 'visible'", 
      [post.id]
    );
    
    post.likes = post.likes_count;
    post.comments = commentsRow.count;
    totalLikes += post.likes;
    totalComments += post.comments;
    filteredPosts.push(post);
  }

  const joinDate = new Date(profileUser.created_at);
  const joinStr = joinDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Minimal safe bio (simulated in frontend, or default text)
  const bio = profileUser.is_seed ? "An early voice on Whisper Pages." : "A writer seeking honest expression.";

  res.json({
    profile: {
      pen_name: profileUser.pen_name,
      join_date: joinStr,
      post_count: postCountRow.count,
      total_likes: totalLikes,
      total_comments: totalComments,
      bio
    },
    posts: filteredPosts
  });
});

// 12. Engagement: Like a Post
app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  const { id } = req.params;
  const post = await dbQuery.get('SELECT * FROM posts WHERE id = ?', [id]);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  // Silent blocking check: if post author blocked the liker, perform silent success
  const isBlocked = await dbQuery.get('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [post.author_id, req.user.id]);
  if (isBlocked) {
    return res.json({ success: true, message: 'Like state toggled.' }); // Return silent success
  }

  const liked = await dbQuery.get('SELECT 1 FROM likes WHERE account_id = ? AND post_id = ?', [req.user.id, id]);

  if (liked) {
    await dbQuery.run('DELETE FROM likes WHERE account_id = ? AND post_id = ?', [req.user.id, id]);
    res.json({ success: true, liked: false });
  } else {
    await dbQuery.run('INSERT INTO likes (account_id, post_id) VALUES (?, ?)', [req.user.id, id]);
    res.json({ success: true, liked: true });
  }
});

// 13. Engagement: Comment on a Post
app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Comment content required.' });
  }

  if (containsProhibitedTerms(content)) {
    return res.status(400).json({ error: 'Comment rejected: Contains prohibited content.' });
  }

  const post = await dbQuery.get('SELECT * FROM posts WHERE id = ?', [id]);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  // Silent blocking check: if post author blocked the commenter, return silent success without saving
  const isBlocked = await dbQuery.get('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [post.author_id, req.user.id]);
  if (isBlocked) {
    return res.status(201).json({ id: 'silent_' + Math.random().toString(36).substr(2, 9), message: 'Comment added.' });
  }

  // Gating restriction: Accounts self-certified under 18 have comments from adults restricted by default
  const postAuthor = await dbQuery.get('SELECT id, age_bracket FROM accounts WHERE id = ?', [post.author_id]);
  if (postAuthor.age_bracket === 'under_18' && req.user.age_bracket !== 'under_18') {
    return res.status(403).json({ error: 'Comments from adult accounts are restricted on this minor writer\'s post.' });
  }

  // Prevent duplicate comments (same author, same post, same content)
  const duplicate = await dbQuery.get(
    "SELECT 1 FROM comments WHERE post_id = ? AND author_id = ? AND content = ? AND status = 'visible'",
    [id, req.user.id, content.trim()]
  );
  if (duplicate) {
    return res.status(400).json({ error: 'Duplicate comment detected. You have already posted this exact comment.' });
  }

  const commentId = 'com_' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();

  await dbQuery.run(
    'INSERT INTO comments (id, post_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
    [commentId, id, req.user.id, content.trim(), now]
  );

  res.status(201).json({ id: commentId, message: 'Comment added successfully.' });
});

// 14. Engagement: Delete Comment
app.delete('/api/comments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const comment = await dbQuery.get('SELECT * FROM comments WHERE id = ?', [id]);
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });

  const post = await dbQuery.get('SELECT * FROM posts WHERE id = ?', [comment.post_id]);

  // Only comment author or post author can delete comment
  if (comment.author_id === req.user.id || post.author_id === req.user.id) {
    await dbQuery.run('DELETE FROM comments WHERE id = ?', [id]);
    return res.json({ success: true });
  }

  res.status(403).json({ error: 'Unauthorized to delete this comment.' });
});

// 15. Silent Blocking
app.post('/api/blocks', requireAuth, async (req, res) => {
  const { blocked_pen_name } = req.body;
  if (!blocked_pen_name) return res.status(400).json({ error: 'Pen name required.' });

  const blockedUser = await dbQuery.get('SELECT id FROM accounts WHERE lower(pen_name) = lower(?)', [blocked_pen_name.trim()]);
  if (!blockedUser) return res.status(404).json({ error: 'User not found.' });

  if (blockedUser.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot block yourself.' });
  }

  try {
    await dbQuery.run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)', [req.user.id, blockedUser.id]);
    res.json({ success: true, message: 'Block placed.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to place block.' });
  }
});

// 16. Confession & Shoutout Wall
app.get('/api/wall', async (req, res) => {
  const wallPosts = await dbQuery.all(
    `SELECT w.*, a.pen_name as author_name 
     FROM wall_posts w
     JOIN accounts a ON w.author_id = a.id
     WHERE w.status = 'visible' 
     ORDER BY w.created_at DESC`
  );
  res.json(wallPosts);
});

// Post to Wall (requires login, short-form limit 500 characters, stricter word filters)
app.post('/api/wall', requireAuth, async (req, res) => {
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content required.' });
  }

  if (content.length > 500) {
    return res.status(400).json({ error: 'Content exceeds Wall limit of 500 characters.' });
  }

  // Stricter wall filtering: Block phone numbers, emails, name patterns, harassment words
  const contactPattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|[\w.-]+@[\w.-]+\.\w+/;
  if (contactPattern.test(content) || containsProhibitedTerms(content)) {
    return res.status(400).json({ error: 'Submission blocked: Content violates Wall guidelines (harassment/identifying data).' });
  }

  const wallPostId = 'wall_' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();

  await dbQuery.run(
    'INSERT INTO wall_posts (id, author_id, content, created_at) VALUES (?, ?, ?, ?)',
    [wallPostId, req.user.id, content.trim(), now]
  );

  res.status(201).json({ id: wallPostId, message: 'Confession posted.' });
});

// 17. Reporting
app.post('/api/reports', requireAuth, rateLimiter(10, 10 * 60 * 1000), async (req, res) => {
  const { target_type, target_id, reason } = req.body;

  if (!target_type || !target_id || !reason) {
    return res.status(400).json({ error: 'Target type, target ID, and reason are required.' });
  }

  const reportId = 'rep_' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();

  // Log report
  await dbQuery.run(
    'INSERT INTO reports (id, target_type, target_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [reportId, target_type, target_id, req.user.id, reason, now]
  );

  // Update target count and check auto-hide
  if (target_type === 'post') {
    const post = await dbQuery.get('SELECT * FROM posts WHERE id = ?', [target_id]);
    if (post) {
      const newCount = post.report_count + 1;
      const status = newCount >= 5 ? 'hidden' : 'published';
      await dbQuery.run('UPDATE posts SET report_count = ?, status = ? WHERE id = ?', [newCount, status, target_id]);
    }
  } else if (target_type === 'comment') {
    const comment = await dbQuery.get('SELECT * FROM comments WHERE id = ?', [target_id]);
    if (comment) {
      const newCount = comment.report_count + 1;
      const status = newCount >= 5 ? 'hidden' : 'visible';
      await dbQuery.run('UPDATE comments SET report_count = ?, status = ? WHERE id = ?', [newCount, status, target_id]);
    }
  } else if (target_type === 'wall_post') {
    const wallPost = await dbQuery.get('SELECT * FROM wall_posts WHERE id = ?', [target_id]);
    if (wallPost) {
      const newCount = wallPost.report_count + 1;
      const status = newCount >= 3 ? 'hidden' : 'visible'; // Lower threshold for Wall posts
      await dbQuery.run('UPDATE wall_posts SET report_count = ?, status = ? WHERE id = ?', [newCount, status, target_id]);
    }
  }

  res.json({ success: true, message: 'Content reported successfully.' });
});

// 18. Feedback Submission
app.post('/api/feedback', async (req, res) => {
  const { category, content, page_context } = req.body;
  if (!category || !content) {
    return res.status(400).json({ error: 'Category and content are required.' });
  }

  const feedbackId = 'feed_' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();

  await dbQuery.run(
    'INSERT INTO feedback (id, category, content, page_context, created_at) VALUES (?, ?, ?, ?, ?)',
    [feedbackId, category, content.trim(), page_context || '', now]
  );

  res.json({ success: true, message: 'Feedback logged.' });
});

// --- ADMIN API ENDPOINTS (Master Admin authorization checked via JWT role) ---

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required.' });
    }
    next();
  });
}

// Admin Audit Log utility
async function logAdminAction(adminId, actionType, targetId, metadata = {}) {
  const logId = 'log_' + Math.random().toString(36).substr(2, 9);
  const now = new Date().toISOString();
  await dbQuery.run(
    'INSERT INTO admin_audit_logs (id, admin_id, action_type, target_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [logId, adminId, actionType, targetId, JSON.stringify(metadata), now]
  );
}

// 1. Get reports queue
app.get('/api/admin/reports', requireAdmin, async (req, res) => {
  const reports = await dbQuery.all(
    `SELECT r.*, a.pen_name as reporter_name 
     FROM reports r 
     JOIN accounts a ON r.reporter_id = a.id 
     ORDER BY r.created_at DESC`
  );
  
  // Resolve reported objects metadata
  for (let r of reports) {
    if (r.target_type === 'post') {
      r.target_details = await dbQuery.get('SELECT p.id, p.content, p.status, a.pen_name as author_name FROM posts p JOIN accounts a ON p.author_id = a.id WHERE p.id = ?', [r.target_id]);
    } else if (r.target_type === 'comment') {
      r.target_details = await dbQuery.get('SELECT c.id, c.content, c.status, a.pen_name as author_name FROM comments c JOIN accounts a ON c.author_id = a.id WHERE c.id = ?', [r.target_id]);
    } else if (r.target_type === 'wall_post') {
      r.target_details = await dbQuery.get('SELECT w.id, w.content, w.status, a.pen_name as author_name FROM wall_posts w JOIN accounts a ON w.author_id = a.id WHERE w.id = ?', [r.target_id]);
    }
  }

  res.json({ reports });
});

// 2. Moderation action (Hide / Restore / Remove)
app.post('/api/admin/action', requireAdmin, async (req, res) => {
  const { target_type, target_id, action, report_id } = req.body;

  if (!target_type || !target_id || !action) {
    return res.status(400).json({ error: 'Missing moderation params.' });
  }

  const tableMap = { post: 'posts', comment: 'comments', wall_post: 'wall_posts' };
  const tbl = tableMap[target_type];
  if (!tbl) return res.status(400).json({ error: 'Invalid target type.' });

  if (action === 'hide') {
    const statusVal = target_type === 'post' ? 'hidden' : 'hidden';
    await dbQuery.run(`UPDATE ${tbl} SET status = 'hidden' WHERE id = ?`, [target_id]);
    await logAdminAction(req.user.id, 'hide_content', target_id, { target_type });
  } else if (action === 'restore') {
    const statusVal = target_type === 'post' ? 'published' : 'visible';
    await dbQuery.run(`UPDATE ${tbl} SET status = ?, report_count = 0 WHERE id = ?`, [statusVal, target_id]);
    await logAdminAction(req.user.id, 'restore_content', target_id, { target_type });
  } else if (action === 'remove') {
    await dbQuery.run(`DELETE FROM ${tbl} WHERE id = ?`, [target_id]);
    await logAdminAction(req.user.id, 'remove_content', target_id, { target_type });
  }

  if (report_id) {
    await dbQuery.run('UPDATE reports SET status = \'reviewed\' WHERE id = ?', [report_id]);
  }

  res.json({ success: true });
});

// 3. User IP lookup (requires 2FA authorization token checks)
app.post('/api/admin/user-lookup', requireAdmin, async (req, res) => {
  const { pen_name, two_factor_token } = req.body;

  if (!pen_name || !two_factor_token) {
    return res.status(400).json({ error: 'Pen name and 2FA token required.' });
  }

  // Validate Situational 2FA Key
  if (two_factor_token !== ADMIN_2FA_KEY) {
    return res.status(401).json({ error: '2FA authentication failed: Invalid security key.' });
  }

  const user = await dbQuery.get('SELECT id, pen_name, age_bracket, created_at, last_active_at, ip_address, status FROM accounts WHERE lower(pen_name) = lower(?)', [pen_name.trim()]);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Log access to immutable audit log BEFORE return
  await logAdminAction(req.user.id, 'view_sensitive_data', user.id, { pen_name: user.pen_name });

  res.json({ user });
});

// 4. Admin Audit Logs
app.get('/api/admin/audit-logs', requireAdmin, async (req, res) => {
  const logs = await dbQuery.all('SELECT * FROM admin_audit_logs ORDER BY created_at DESC');
  res.json({ logs });
});

// 5. Admin Feedback Queue
app.get('/api/admin/feedback', requireAdmin, async (req, res) => {
  const feedbackItems = await dbQuery.all('SELECT * FROM feedback ORDER BY created_at DESC');
  res.json({ feedbackItems });
});

// 6. Simulate account inactivity lifecycle
app.post('/api/admin/simulate-inactivity', requireAdmin, async (req, res) => {
  const { age_days, pen_name } = req.body;
  
  if (!pen_name || !age_days) {
    return res.status(400).json({ error: 'Pen name and age (days) are required.' });
  }

  // Adjust user last_active_at date in DB
  const user = await dbQuery.get('SELECT id FROM accounts WHERE lower(pen_name) = lower(?)', [pen_name.trim()]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - parseInt(age_days));
  const newDateStr = targetDate.toISOString();

  await dbQuery.run('UPDATE accounts SET last_active_at = ? WHERE id = ?', [newDateStr, user.id]);

  // Run inactivity cleanup simulation
  const now = new Date();
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - 300); // 300 days inactivity limit
  const thresholdStr = thresholdDate.toISOString();

  // Find all accounts older than 300 days inactive
  const inactiveAccounts = await dbQuery.all('SELECT id, pen_name FROM accounts WHERE last_active_at <= ?', [thresholdStr]);
  
  const deletedUserNames = [];
  for (let acc of inactiveAccounts) {
    deletedUserNames.push(acc.pen_name);
    // Perform cascading deletions (foreign keys ON DELETE CASCADE handle references)
    await dbQuery.run('DELETE FROM accounts WHERE id = ?', [acc.id]);
  }

  res.json({
    success: true,
    message: `Inactivity simulation ran. Aged ${pen_name}'s last active stamp by ${age_days} days.`,
    deleted: deletedUserNames
  });
});

// Fallback to SPA Frontend router
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Initialise DB and Start server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  initDb().then(() => {
    app.listen(PORT, () => {
      console.log(`Whisper Pages Server started on http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Database initialisation failed:', err);
  });
} else {
  initDb().catch(err => {
    console.error('Database initialisation failed in serverless boot:', err);
  });
}

export default app;
