import sqlite3 from 'sqlite3';
import pg from 'pg';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || join(__dirname, 'whisper_pages.db');

const usePostgres = !!process.env.DATABASE_URL;

let db = null;
let pool = null;

if (usePostgres) {
  const { Pool } = pg;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
} else {
  const sqlite = sqlite3.verbose();
  db = new sqlite.Database(dbPath);
  db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON;');
  });
}

function convertSql(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

// Promisified query wrappers supporting dual engines
export const dbQuery = {
  run: (sql, params = []) => {
    if (usePostgres) {
      return new Promise(async (resolve, reject) => {
        try {
          if (sql.trim().toUpperCase().startsWith('PRAGMA')) {
            return resolve({ lastID: null, changes: 0 });
          }
          const pgSql = convertSql(sql);
          const res = await pool.query(pgSql, params);
          resolve({ lastID: null, changes: res.rowCount });
        } catch (err) {
          reject(err);
        }
      });
    } else {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    }
  },
  get: (sql, params = []) => {
    if (usePostgres) {
      return new Promise(async (resolve, reject) => {
        try {
          const pgSql = convertSql(sql);
          const res = await pool.query(pgSql, params);
          resolve(res.rows[0] || undefined);
        } catch (err) {
          reject(err);
        }
      });
    } else {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }
  },
  all: (sql, params = []) => {
    if (usePostgres) {
      return new Promise(async (resolve, reject) => {
        try {
          const pgSql = convertSql(sql);
          const res = await pool.query(pgSql, params);
          resolve(res.rows);
        } catch (err) {
          reject(err);
        }
      });
    } else {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
  }
};

// Initialize Tables
export async function initDb() {
  // Accounts table
  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      pen_name TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      age_bracket TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      is_seed INTEGER DEFAULT 0,
      ip_address TEXT NOT NULL
    )
  `);

  // Ensure case-insensitive uniqueness index on pen_name
  await dbQuery.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_pen_name_lower 
    ON accounts(lower(pen_name))
  `);

  // Posts table
  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      content_rating TEXT NOT NULL,
      tags TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_seed INTEGER DEFAULT 0,
      report_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',
      FOREIGN KEY (author_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Comments table
  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      report_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'visible',
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Wall posts table
  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS wall_posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      report_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      status TEXT DEFAULT 'visible',
      FOREIGN KEY (author_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Likes table
  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS likes (
      account_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      PRIMARY KEY (account_id, post_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
  `);

  // Reports table
  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY (reporter_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Blocks table
  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id),
      FOREIGN KEY (blocker_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Admin audit logs table
  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Feedback table
  await dbQuery.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      page_context TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Ensure the virtual master admin account exists in accounts table to pass foreign key constraints
  const adminAccount = await dbQuery.get("SELECT 1 FROM accounts WHERE id = 'admin_master'");
  if (!adminAccount) {
    const now = new Date().toISOString();
    await dbQuery.run(
      "INSERT INTO accounts (id, pen_name, password_hash, age_bracket, created_at, last_active_at, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ['admin_master', 'Admin Master', 'admin_virtual_placeholder', '50_plus', now, now, '127.0.0.1']
    );
  }

  console.log('Database tables successfully initialized.');
}
