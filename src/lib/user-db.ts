import type { D1Database } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import mysql from 'mysql2/promise';

export type AccountUser = {
  id: string;
  email: string;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt: string | null;
  emailVerified: boolean;
};

type UserDatabase =
  | { kind: 'd1'; db: D1Database }
  | { kind: 'mysql'; db: mysql.Pool };

type AccountUserWithCredentials = AccountUser & { passwordHash: string; passwordSalt: string };
export type AccountTokenPurpose = 'verify_email' | 'reset_password';
type D1Env = { ADMIN_DB?: D1Database };

const SESSION_D1_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_app_users_created_at ON app_users(created_at)',
  `CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions(expires_at)',
  `CREATE TABLE IF NOT EXISTS app_email_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_app_email_tokens_user_purpose ON app_email_tokens(user_id, purpose)',
  `CREATE TABLE IF NOT EXISTS app_auth_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_app_auth_attempts_ip_time ON app_auth_attempts(ip_hash, created_at)',
];

let mysqlPool: mysql.Pool | null = null;
let mysqlReady = false;
let d1ReadyPromise: Promise<void> | null = null;

function getMySqlPool() {
  if (mysqlPool) return mysqlPool;
  const password = process.env.MYSQL_PASSWORD?.trim();
  if (!password) throw new Error('MYSQL_PASSWORD 未配置，无法使用用户系统。');
  mysqlPool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password,
    database: process.env.MYSQL_DATABASE || 'ai_word',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
  return mysqlPool;
}

async function getUserDatabase(): Promise<UserDatabase> {
  let cloudflareDb: D1Database | undefined;
  try {
    const context = await getCloudflareContext({ async: true });
    cloudflareDb = (context.env as D1Env).ADMIN_DB;
  } catch {
    // Local `next dev` has no Cloudflare context and uses the configured MySQL database.
  }
  if (cloudflareDb) {
    if (!d1ReadyPromise) {
      d1ReadyPromise = (async () => {
        for (const sql of SESSION_D1_SCHEMA) await cloudflareDb!.prepare(sql).run();
        try {
          await cloudflareDb!.prepare('ALTER TABLE app_users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0').run();
        } catch {
          // Existing account tables already have this column.
        }
        try {
          await cloudflareDb!.prepare('ALTER TABLE admin_events ADD COLUMN user_id TEXT').run();
        } catch {
          // Existing databases already have the nullable ownership column.
        }
      })();
    }
    try {
      await d1ReadyPromise;
    } catch (error) {
      d1ReadyPromise = null;
      throw error;
    }
    return { kind: 'd1', db: cloudflareDb };
  }

  const db = getMySqlPool();
  if (!mysqlReady) {
    await db.query(`CREATE TABLE IF NOT EXISTS app_users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(256) NOT NULL,
      password_salt VARCHAR(128) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      created_at VARCHAR(64) NOT NULL,
      last_login_at VARCHAR(64),
      INDEX idx_app_users_created_at (created_at)
    )`);
    try {
      await db.query('ALTER TABLE app_users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0');
    } catch {
      // Column already exists.
    }
    await db.query(`CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      expires_at VARCHAR(64) NOT NULL,
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_app_sessions_user_id (user_id),
      INDEX idx_app_sessions_expires_at (expires_at)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS app_email_tokens (
      token_hash VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      purpose VARCHAR(32) NOT NULL,
      expires_at VARCHAR(64) NOT NULL,
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_app_email_tokens_user_purpose (user_id, purpose)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS app_auth_attempts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      ip_hash VARCHAR(64) NOT NULL,
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_app_auth_attempts_ip_time (ip_hash, created_at)
    )`);
    try {
      await db.query('ALTER TABLE admin_events ADD COLUMN user_id VARCHAR(64)');
    } catch {
      // Existing databases already have the nullable ownership column.
    }
    mysqlReady = true;
  }
  return { kind: 'mysql', db };
}

export async function consumeAuthAttempt(ipHash: string) {
  const database = await getUserDatabase();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const timestamp = now.toISOString();
  if (database.kind === 'd1') {
    const row = await database.db.prepare('SELECT COUNT(*) AS count FROM app_auth_attempts WHERE ip_hash = ? AND created_at > ?')
      .bind(ipHash, windowStart).first<{ count: number }>();
    if ((Number(row?.count) || 0) >= 20) return false;
    await database.db.prepare('INSERT INTO app_auth_attempts(ip_hash, created_at) VALUES (?, ?)').bind(ipHash, timestamp).run();
    await database.db.prepare('DELETE FROM app_auth_attempts WHERE created_at < ?').bind(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()).run();
    return true;
  }
  const [rows] = await database.db.query('SELECT COUNT(*) AS count FROM app_auth_attempts WHERE ip_hash = ? AND created_at > ?', [ipHash, windowStart]) as [mysql.RowDataPacket[], unknown];
  if ((Number(rows[0]?.count) || 0) >= 20) return false;
  await database.db.query('INSERT INTO app_auth_attempts(ip_hash, created_at) VALUES (?, ?)', [ipHash, timestamp]);
  await database.db.query('DELETE FROM app_auth_attempts WHERE created_at < ?', [new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()]);
  return true;
}

export async function createAccount(input: { email: string; passwordHash: string; passwordSalt: string }): Promise<AccountUser> {
  const database = await getUserDatabase();
  const user: AccountUser = {
    id: crypto.randomUUID(),
    email: input.email,
    status: 'active',
    emailVerified: false,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  if (database.kind === 'd1') {
    await database.db.prepare('INSERT INTO app_users(id, email, password_hash, password_salt, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(user.id, input.email, input.passwordHash, input.passwordSalt, user.status, 0, user.createdAt).run();
  } else {
    await database.db.query('INSERT INTO app_users(id, email, password_hash, password_salt, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, input.email, input.passwordHash, input.passwordSalt, user.status, 0, user.createdAt]);
  }
  return user;
}

export async function findAccountByEmail(email: string): Promise<AccountUserWithCredentials | null> {
  const database = await getUserDatabase();
  const sql = `SELECT id, email, password_hash AS passwordHash, password_salt AS passwordSalt, status, email_verified AS emailVerified,
    created_at AS createdAt, last_login_at AS lastLoginAt FROM app_users WHERE email = ? LIMIT 1`;
  if (database.kind === 'd1') return database.db.prepare(sql).bind(email).first<AccountUserWithCredentials>();
  const [rows] = await database.db.query(sql, [email]) as [mysql.RowDataPacket[], unknown];
  return (rows[0] as AccountUserWithCredentials | undefined) || null;
}

export async function createAccountSession(userId: string, tokenHash: string, expiresAt: string) {
  const database = await getUserDatabase();
  const createdAt = new Date().toISOString();
  if (database.kind === 'd1') {
    await database.db.prepare('INSERT INTO app_sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(tokenHash, userId, expiresAt, createdAt).run();
    await database.db.prepare('UPDATE app_users SET last_login_at = ? WHERE id = ?').bind(createdAt, userId).run();
    await database.db.prepare('DELETE FROM app_sessions WHERE expires_at <= ?').bind(createdAt).run();
  } else {
    await database.db.query('INSERT INTO app_sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [tokenHash, userId, expiresAt, createdAt]);
    await database.db.query('UPDATE app_users SET last_login_at = ? WHERE id = ?', [createdAt, userId]);
    await database.db.query('DELETE FROM app_sessions WHERE expires_at <= ?', [createdAt]);
  }
}

export async function findAccountBySession(tokenHash: string): Promise<AccountUser | null> {
  const database = await getUserDatabase();
  const sql = `SELECT u.id, u.email, u.status, u.email_verified AS emailVerified, u.created_at AS createdAt, u.last_login_at AS lastLoginAt
    FROM app_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`;
  const now = new Date().toISOString();
  if (database.kind === 'd1') return database.db.prepare(sql).bind(tokenHash, now).first<AccountUser>();
  const [rows] = await database.db.query(sql, [tokenHash, now]) as [mysql.RowDataPacket[], unknown];
  return (rows[0] as AccountUser | undefined) || null;
}

export async function createAccountToken(userId: string, purpose: AccountTokenPurpose, tokenHash: string, expiresAt: string) {
  const database = await getUserDatabase();
  const createdAt = new Date().toISOString();
  if (database.kind === 'd1') {
    await database.db.prepare('DELETE FROM app_email_tokens WHERE user_id = ? AND purpose = ?').bind(userId, purpose).run();
    await database.db.prepare('INSERT INTO app_email_tokens(token_hash, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(tokenHash, userId, purpose, expiresAt, createdAt).run();
  } else {
    await database.db.query('DELETE FROM app_email_tokens WHERE user_id = ? AND purpose = ?', [userId, purpose]);
    await database.db.query('INSERT INTO app_email_tokens(token_hash, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [tokenHash, userId, purpose, expiresAt, createdAt]);
  }
}

export async function consumeAccountToken(tokenHash: string, purpose: AccountTokenPurpose) {
  const database = await getUserDatabase();
  const now = new Date().toISOString();
  const selectSql = `SELECT u.id, u.email, u.status, u.email_verified AS emailVerified, u.created_at AS createdAt,
      u.last_login_at AS lastLoginAt, t.user_id AS tokenUserId
    FROM app_email_tokens t JOIN app_users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.purpose = ? AND t.expires_at > ? AND u.status = 'active' LIMIT 1`;
  let user: (AccountUser & { tokenUserId: string }) | null;
  if (database.kind === 'd1') user = await database.db.prepare(selectSql).bind(tokenHash, purpose, now).first<AccountUser & { tokenUserId: string }>();
  else {
    const [rows] = await database.db.query(selectSql, [tokenHash, purpose, now]) as [mysql.RowDataPacket[], unknown];
    user = (rows[0] as (AccountUser & { tokenUserId: string }) | undefined) || null;
  }
  if (!user) return null;

  let consumed = false;
  if (database.kind === 'd1') {
    const result = await database.db.prepare('DELETE FROM app_email_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ?')
      .bind(tokenHash, purpose, now).run();
    consumed = Number(result.meta.changes) > 0;
  } else {
    const [result] = await database.db.query('DELETE FROM app_email_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ?',
      [tokenHash, purpose, now]) as [mysql.ResultSetHeader, unknown];
    consumed = result.affectedRows > 0;
  }
  return consumed ? user : null;
}

export async function markAccountEmailVerified(userId: string) {
  const database = await getUserDatabase();
  if (database.kind === 'd1') await database.db.prepare('UPDATE app_users SET email_verified = 1 WHERE id = ?').bind(userId).run();
  else await database.db.query('UPDATE app_users SET email_verified = 1 WHERE id = ?', [userId]);
}

export async function updateAccountPassword(userId: string, passwordHash: string, passwordSalt: string) {
  const database = await getUserDatabase();
  if (database.kind === 'd1') {
    await database.db.prepare('UPDATE app_users SET password_hash = ?, password_salt = ? WHERE id = ?').bind(passwordHash, passwordSalt, userId).run();
    await database.db.prepare('DELETE FROM app_sessions WHERE user_id = ?').bind(userId).run();
  } else {
    await database.db.query('UPDATE app_users SET password_hash = ?, password_salt = ? WHERE id = ?', [passwordHash, passwordSalt, userId]);
    await database.db.query('DELETE FROM app_sessions WHERE user_id = ?', [userId]);
  }
}

export async function findAccountByEmailForMail(email: string) {
  const database = await getUserDatabase();
  const sql = `SELECT id, email, status, email_verified AS emailVerified, created_at AS createdAt, last_login_at AS lastLoginAt
    FROM app_users WHERE email = ? LIMIT 1`;
  if (database.kind === 'd1') return database.db.prepare(sql).bind(email).first<AccountUser>();
  const [rows] = await database.db.query(sql, [email]) as [mysql.RowDataPacket[], unknown];
  return (rows[0] as AccountUser | undefined) || null;
}

export async function deleteAccountSession(tokenHash: string) {
  const database = await getUserDatabase();
  if (database.kind === 'd1') await database.db.prepare('DELETE FROM app_sessions WHERE token_hash = ?').bind(tokenHash).run();
  else await database.db.query('DELETE FROM app_sessions WHERE token_hash = ?', [tokenHash]);
}

export async function getAdminAccounts() {
  const database = await getUserDatabase();
  const today = new Date().toISOString().slice(0, 10);
  if (database.kind === 'd1') {
    const counts = await database.db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN substr(created_at, 1, 10) = ? THEN 1 ELSE 0 END) AS today FROM app_users`)
      .bind(today).first<{ total: number; active: number | null; today: number | null }>();
    const users = await database.db.prepare(`SELECT u.id, u.email, u.status, u.email_verified AS emailVerified, u.created_at AS createdAt,
      u.last_login_at AS lastLoginAt,
      SUM(CASE WHEN e.type = 'generate' THEN 1 ELSE 0 END) AS generations,
      SUM(CASE WHEN e.type = 'download' THEN 1 ELSE 0 END) AS downloads
      FROM app_users u LEFT JOIN admin_events e ON e.user_id = u.id
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`).all();
    return { total: Number(counts?.total) || 0, active: Number(counts?.active) || 0, today: Number(counts?.today) || 0, users: users.results || [] };
  }
  const [countRows] = await database.db.query(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
    SUM(CASE WHEN LEFT(created_at, 10) = ? THEN 1 ELSE 0 END) AS today FROM app_users`, [today]) as [mysql.RowDataPacket[], unknown];
  const [users] = await database.db.query(`SELECT u.id, u.email, u.status, u.email_verified AS emailVerified, u.created_at AS createdAt,
    u.last_login_at AS lastLoginAt,
    SUM(CASE WHEN e.type = 'generate' THEN 1 ELSE 0 END) AS generations,
    SUM(CASE WHEN e.type = 'download' THEN 1 ELSE 0 END) AS downloads
    FROM app_users u LEFT JOIN admin_events e ON e.user_id = u.id
    GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`) as [mysql.RowDataPacket[], unknown];
  return { total: Number(countRows[0]?.total) || 0, active: Number(countRows[0]?.active) || 0, today: Number(countRows[0]?.today) || 0, users };
}

export async function updateAccountStatus(userId: string, status: 'active' | 'disabled') {
  const database = await getUserDatabase();
  if (database.kind === 'd1') {
    await database.db.prepare('UPDATE app_users SET status = ? WHERE id = ?').bind(status, userId).run();
    if (status === 'disabled') await database.db.prepare('DELETE FROM app_sessions WHERE user_id = ?').bind(userId).run();
  } else {
    await database.db.query('UPDATE app_users SET status = ? WHERE id = ?', [status, userId]);
    if (status === 'disabled') await database.db.query('DELETE FROM app_sessions WHERE user_id = ?', [userId]);
  }
}
