import type { D1Database } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import mysql from 'mysql2/promise';

export type AdminEventInput = {
  type: 'generate' | 'download';
  status: 'success' | 'error';
  model?: string;
  hasImages?: boolean;
  promptLength?: number;
  markdownLength?: number;
  errorMessage?: string;
};

type AdminEventRow = {
  id: string;
  type: 'generate' | 'download';
  status: 'success' | 'error';
  model: string | null;
  hasImages: number | null;
  promptLength: number | null;
  markdownLength: number | null;
  errorMessage: string | null;
  createdAt: string;
};

type D1AdminEnv = {
  ADMIN_DB?: D1Database;
};

let pool: mysql.Pool | null = null;
let mysqlInitialized = false;
let d1Initialized = false;
let d1Initialization: Promise<void> | null = null;

const D1_SCHEMA = [
  `
  CREATE TABLE IF NOT EXISTS admin_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `
  CREATE TABLE IF NOT EXISTS admin_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    model TEXT,
    has_images INTEGER,
    prompt_length INTEGER,
    markdown_length INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_admin_events_created_at ON admin_events(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_admin_events_type ON admin_events(type)',
  `
  CREATE TABLE IF NOT EXISTS admin_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_key TEXT NOT NULL,
    date_key TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_admin_visits_date_key ON admin_visits(date_key)',
  'CREATE INDEX IF NOT EXISTS idx_admin_visits_visitor_key ON admin_visits(visitor_key)',
];

async function getD1Database(): Promise<D1Database | null> {
  try {
    const context = await getCloudflareContext({ async: true });
    return (context.env as D1AdminEnv).ADMIN_DB || null;
  } catch {
    // `next dev` does not provide a Cloudflare context; use MySQL locally.
    return null;
  }
}

function getPool(): mysql.Pool {
  if (pool) return pool;
  const password = process.env.MYSQL_PASSWORD?.trim();
  if (!password) {
    throw new Error('MYSQL_PASSWORD 未配置，无法启用管理统计。');
  }
  pool = mysql.createPool({
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
  return pool;
}

async function ensureMySqlTables() {
  if (mysqlInitialized) return;
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_meta (
      \`key\` VARCHAR(191) PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_events (
      id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL,
      model VARCHAR(128),
      has_images TINYINT(1),
      prompt_length INT,
      markdown_length INT,
      error_message TEXT,
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_created_at (created_at DESC),
      INDEX idx_type (type)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      visitor_key VARCHAR(512) NOT NULL,
      date_key VARCHAR(32) NOT NULL,
      created_at VARCHAR(64) NOT NULL,
      INDEX idx_date_key (date_key),
      INDEX idx_visitor_key (visitor_key)
    )
  `);
  await db.query(
    'INSERT IGNORE INTO admin_meta(`key`, `value`) VALUES(?, ?)',
    ['startedAt', new Date().toISOString()]
  );
  mysqlInitialized = true;
}

async function ensureD1Tables(db: D1Database) {
  if (d1Initialized) return;
  if (!d1Initialization) {
    d1Initialization = (async () => {
      for (const statement of D1_SCHEMA) {
        await db.prepare(statement).run();
      }
      await db.prepare('INSERT OR IGNORE INTO admin_meta(key, value) VALUES(?, ?)')
        .bind('startedAt', new Date().toISOString())
        .run();
      d1Initialized = true;
    })();
  }
  try {
    await d1Initialization;
  } catch (error) {
    d1Initialization = null;
    throw error;
  }
}

async function getDatabase() {
  const d1 = await getD1Database();
  if (d1) {
    await ensureD1Tables(d1);
    return { kind: 'd1' as const, db: d1 };
  }
  await ensureMySqlTables();
  return { kind: 'mysql' as const, db: getPool() };
}

export async function insertAdminEvent(event: AdminEventInput) {
  const database = await getDatabase();
  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const values: mysql.QueryValues = [
    id,
    event.type,
    event.status,
    event.model || null,
    event.hasImages ? 1 : 0,
    Number.isFinite(event.promptLength) ? event.promptLength : null,
    Number.isFinite(event.markdownLength) ? event.markdownLength : null,
    event.errorMessage || null,
    createdAt,
  ];

  if (database.kind === 'd1') {
    await database.db.prepare(
      `INSERT INTO admin_events(id, type, status, model, has_images, prompt_length, markdown_length, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...values).run();
    return;
  }

  await database.db.query(
    `INSERT INTO admin_events(id, type, status, model, has_images, prompt_length, markdown_length, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    values
  );
}

export async function insertAdminVisit(input: { visitorKey: string; dateKey?: string }) {
  const database = await getDatabase();
  const dateKey = input.dateKey || new Date().toISOString().slice(0, 10);
  const createdAt = new Date().toISOString();
  if (database.kind === 'd1') {
    await database.db.prepare(
      'INSERT INTO admin_visits(visitor_key, date_key, created_at) VALUES (?, ?, ?)'
    ).bind(input.visitorKey, dateKey, createdAt).run();
    return;
  }
  await database.db.query(
    'INSERT INTO admin_visits(visitor_key, date_key, created_at) VALUES (?, ?, ?)',
    [input.visitorKey, dateKey, createdAt]
  );
}

export async function getAdminStartedAt(): Promise<string> {
  const database = await getDatabase();
  if (database.kind === 'd1') {
    const row = await database.db.prepare(
      'SELECT value FROM admin_meta WHERE key = ? LIMIT 1'
    ).bind('startedAt').first<{ value: string }>();
    return row?.value || new Date().toISOString();
  }
  const [rows] = await database.db.query(
    'SELECT `value` FROM admin_meta WHERE `key` = ? LIMIT 1',
    ['startedAt']
  ) as [mysql.RowDataPacket[], unknown];
  return (rows[0]?.value as string) || new Date().toISOString();
}

export async function getAdminAggregates() {
  const database = await getDatabase();
  const todayKey = new Date().toISOString().slice(0, 10);
  const firstHourDayKey = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (database.kind === 'd1') {
    const firstDayKey = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const eventAgg = await database.db.prepare(`
      SELECT
        SUM(CASE WHEN type = 'generate' THEN 1 ELSE 0 END) AS generate_total,
        SUM(CASE WHEN type = 'generate' AND status = 'success' THEN 1 ELSE 0 END) AS generate_success,
        SUM(CASE WHEN type = 'generate' AND status = 'error' THEN 1 ELSE 0 END) AS generate_error,
        SUM(CASE WHEN type = 'download' THEN 1 ELSE 0 END) AS download_total,
        SUM(CASE WHEN type = 'download' AND status = 'success' THEN 1 ELSE 0 END) AS download_success,
        SUM(CASE WHEN type = 'download' AND status = 'error' THEN 1 ELSE 0 END) AS download_error,
        SUM(CASE WHEN type = 'generate' AND has_images = 1 THEN 1 ELSE 0 END) AS generate_with_images,
        SUM(CASE WHEN type = 'generate' AND (has_images = 0 OR has_images IS NULL) THEN 1 ELSE 0 END) AS generate_text_only
      FROM admin_events
    `).first<Record<string, number | null>>() || {};
    const total = await database.db.prepare('SELECT COUNT(*) AS count FROM admin_visits').first<{ count: number }>();
    const unique = await database.db.prepare('SELECT COUNT(DISTINCT visitor_key) AS count FROM admin_visits').first<{ count: number }>();
    const today = await database.db.prepare('SELECT COUNT(*) AS count FROM admin_visits WHERE date_key = ?').bind(todayKey).first<{ count: number }>();
    const todayUnique = await database.db.prepare('SELECT COUNT(DISTINCT visitor_key) AS count FROM admin_visits WHERE date_key = ?').bind(todayKey).first<{ count: number }>();
    const last7 = await database.db.prepare(`
      SELECT date_key AS date, COUNT(*) AS visits, COUNT(DISTINCT visitor_key) AS unique_visitors
      FROM admin_visits
      GROUP BY date_key
      ORDER BY date_key DESC
      LIMIT 7
    `).all<{ date: string; visits: number; unique_visitors: number }>();
    const last7Requests = await database.db.prepare(`
      SELECT substr(created_at, 1, 10) AS date,
        SUM(CASE WHEN type = 'generate' THEN 1 ELSE 0 END) AS generate_total,
        SUM(CASE WHEN type = 'download' THEN 1 ELSE 0 END) AS download_total
      FROM admin_events
      WHERE substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date
    `).bind(firstDayKey, todayKey).all<{
      date: string;
      generate_total: number;
      download_total: number;
    }>();
    const hourlyRequests = await database.db.prepare(`
      SELECT substr(created_at, 12, 2) AS hour, COUNT(*) AS requests
      FROM admin_events
      WHERE substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?
      GROUP BY substr(created_at, 12, 2)
      ORDER BY hour
    `).bind(firstHourDayKey, todayKey).all<{ hour: string; requests: number }>();

    return {
      generateTotal: Number(eventAgg.generate_total) || 0,
      generateSuccess: Number(eventAgg.generate_success) || 0,
      generateError: Number(eventAgg.generate_error) || 0,
      downloadTotal: Number(eventAgg.download_total) || 0,
      downloadSuccess: Number(eventAgg.download_success) || 0,
      downloadError: Number(eventAgg.download_error) || 0,
      generateWithImages: Number(eventAgg.generate_with_images) || 0,
      generateTextOnly: Number(eventAgg.generate_text_only) || 0,
      totalVisits: Number(total?.count) || 0,
      uniqueVisitors: Number(unique?.count) || 0,
      todayVisits: Number(today?.count) || 0,
      todayUniqueVisitors: Number(todayUnique?.count) || 0,
      last7Days: (last7.results || []).reverse().map((item) => ({
        date: item.date,
        visits: Number(item.visits),
        uniqueVisitors: Number(item.unique_visitors),
      })),
      last7RequestDays: (last7Requests.results || []).map((item) => ({
        date: item.date,
        generate: Number(item.generate_total) || 0,
        download: Number(item.download_total) || 0,
      })),
      hourlyRequests: (hourlyRequests.results || []).map((item) => ({
        hour: Number(item.hour),
        requests: Number(item.requests) || 0,
      })),
    };
  }

  const firstDayKey = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [eventRows] = await database.db.query(`
    SELECT
      SUM(CASE WHEN type = 'generate' THEN 1 ELSE 0 END) AS generate_total,
      SUM(CASE WHEN type = 'generate' AND status = 'success' THEN 1 ELSE 0 END) AS generate_success,
      SUM(CASE WHEN type = 'generate' AND status = 'error' THEN 1 ELSE 0 END) AS generate_error,
      SUM(CASE WHEN type = 'download' THEN 1 ELSE 0 END) AS download_total,
      SUM(CASE WHEN type = 'download' AND status = 'success' THEN 1 ELSE 0 END) AS download_success,
      SUM(CASE WHEN type = 'download' AND status = 'error' THEN 1 ELSE 0 END) AS download_error,
      SUM(CASE WHEN type = 'generate' AND has_images = 1 THEN 1 ELSE 0 END) AS generate_with_images,
      SUM(CASE WHEN type = 'generate' AND (has_images = 0 OR has_images IS NULL) THEN 1 ELSE 0 END) AS generate_text_only
    FROM admin_events
  `) as [mysql.RowDataPacket[], unknown];
  const eventAgg = eventRows[0] || {};
  const [totalRows] = await database.db.query('SELECT COUNT(*) AS count FROM admin_visits') as [mysql.RowDataPacket[], unknown];
  const [uniqueRows] = await database.db.query('SELECT COUNT(DISTINCT visitor_key) AS count FROM admin_visits') as [mysql.RowDataPacket[], unknown];
  const [todayRows] = await database.db.query('SELECT COUNT(*) AS count FROM admin_visits WHERE date_key = ?', [todayKey]) as [mysql.RowDataPacket[], unknown];
  const [todayUniqueRows] = await database.db.query('SELECT COUNT(DISTINCT visitor_key) AS count FROM admin_visits WHERE date_key = ?', [todayKey]) as [mysql.RowDataPacket[], unknown];
  const [last7Rows] = await database.db.query(`
    SELECT date_key AS \`date\`, COUNT(*) AS visits, COUNT(DISTINCT visitor_key) AS unique_visitors
    FROM admin_visits
    GROUP BY date_key
    ORDER BY date_key DESC
    LIMIT 7
  `) as [mysql.RowDataPacket[], unknown];
  const [last7RequestRows] = await database.db.query(`
    SELECT LEFT(created_at, 10) AS day_key,
      SUM(CASE WHEN type = 'generate' THEN 1 ELSE 0 END) AS generate_total,
      SUM(CASE WHEN type = 'download' THEN 1 ELSE 0 END) AS download_total
    FROM admin_events
    WHERE LEFT(created_at, 10) >= ? AND LEFT(created_at, 10) <= ?
    GROUP BY LEFT(created_at, 10)
    ORDER BY day_key
  `, [firstDayKey, todayKey]) as [mysql.RowDataPacket[], unknown];
  const [hourlyRequestRows] = await database.db.query(`
    SELECT SUBSTRING(created_at, 12, 2) AS hour, COUNT(*) AS requests
    FROM admin_events
    WHERE LEFT(created_at, 10) >= ? AND LEFT(created_at, 10) <= ?
    GROUP BY SUBSTRING(created_at, 12, 2)
    ORDER BY hour
  `, [firstHourDayKey, todayKey]) as [mysql.RowDataPacket[], unknown];

  return {
    generateTotal: Number(eventAgg.generate_total) || 0,
    generateSuccess: Number(eventAgg.generate_success) || 0,
    generateError: Number(eventAgg.generate_error) || 0,
    downloadTotal: Number(eventAgg.download_total) || 0,
    downloadSuccess: Number(eventAgg.download_success) || 0,
    downloadError: Number(eventAgg.download_error) || 0,
    generateWithImages: Number(eventAgg.generate_with_images) || 0,
    generateTextOnly: Number(eventAgg.generate_text_only) || 0,
    totalVisits: Number(totalRows[0]?.count) || 0,
    uniqueVisitors: Number(uniqueRows[0]?.count) || 0,
    todayVisits: Number(todayRows[0]?.count) || 0,
    todayUniqueVisitors: Number(todayUniqueRows[0]?.count) || 0,
    last7Days: (last7Rows as Array<{ date: string; visits: number; unique_visitors: number }>).reverse().map((item) => ({
      date: item.date,
      visits: Number(item.visits),
      uniqueVisitors: Number(item.unique_visitors),
    })),
    last7RequestDays: (last7RequestRows as Array<{ day_key: string; generate_total: number; download_total: number }>).map((item) => ({
      date: item.day_key,
      generate: Number(item.generate_total) || 0,
      download: Number(item.download_total) || 0,
    })),
    hourlyRequests: (hourlyRequestRows as Array<{ hour: string; requests: number }>).map((item) => ({
      hour: Number(item.hour),
      requests: Number(item.requests) || 0,
    })),
  };
}

export async function getRecentAdminEvents(limit = 80): Promise<AdminEventRow[]> {
  const database = await getDatabase();
  if (database.kind === 'd1') {
    const result = await database.db.prepare(
      `SELECT id, type, status, model, has_images AS hasImages, prompt_length AS promptLength,
              markdown_length AS markdownLength, error_message AS errorMessage, created_at AS createdAt
       FROM admin_events ORDER BY created_at DESC LIMIT ?`
    ).bind(limit).all<AdminEventRow>();
    return result.results || [];
  }
  const [rows] = await database.db.query(
    `SELECT id, type, status, model, has_images AS hasImages, prompt_length AS promptLength,
            markdown_length AS markdownLength, error_message AS errorMessage, created_at AS createdAt
     FROM admin_events ORDER BY created_at DESC LIMIT ?`,
    [limit]
  ) as [mysql.RowDataPacket[], unknown];
  return rows as AdminEventRow[];
}
