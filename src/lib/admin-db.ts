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

let pool: mysql.Pool | null = null;
let initialized = false;

function getPool(): mysql.Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'HAIfuge27',
    database: process.env.MYSQL_DATABASE || 'ai_word',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
  return pool;
}

async function ensureTables() {
  if (initialized) return;
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
  const [rows] = await db.query(
    'SELECT `value` FROM admin_meta WHERE `key` = ? LIMIT 1',
    ['startedAt']
  ) as [mysql.RowDataPacket[], unknown];
  if (!rows.length) {
    await db.query(
      'INSERT IGNORE INTO admin_meta(`key`, `value`) VALUES(?, ?)',
      ['startedAt', new Date().toISOString()]
    );
  }
  initialized = true;
}

export async function insertAdminEvent(event: AdminEventInput) {
  await ensureTables();
  const db = getPool();
  await db.query(
    `INSERT INTO admin_events(id, type, status, model, has_images, prompt_length, markdown_length, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      event.type,
      event.status,
      event.model || null,
      event.hasImages ? 1 : 0,
      Number.isFinite(event.promptLength) ? event.promptLength : null,
      Number.isFinite(event.markdownLength) ? event.markdownLength : null,
      event.errorMessage || null,
      new Date().toISOString(),
    ]
  );
}

export async function insertAdminVisit(input: { visitorKey: string; dateKey?: string }) {
  await ensureTables();
  const db = getPool();
  const dateKey = input.dateKey || new Date().toISOString().slice(0, 10);
  await db.query(
    'INSERT INTO admin_visits(visitor_key, date_key, created_at) VALUES (?, ?, ?)',
    [input.visitorKey, dateKey, new Date().toISOString()]
  );
}

export async function getAdminStartedAt(): Promise<string> {
  await ensureTables();
  const db = getPool();
  const [rows] = await db.query(
    'SELECT `value` FROM admin_meta WHERE `key` = ? LIMIT 1',
    ['startedAt']
  ) as [mysql.RowDataPacket[], unknown];
  return (rows[0]?.value as string) || new Date().toISOString();
}

export async function getAdminAggregates() {
  await ensureTables();
  const db = getPool();
  const [eventRows] = await db.query(`
    SELECT
      SUM(CASE WHEN type = 'generate' THEN 1 ELSE 0 END) AS generate_total,
      SUM(CASE WHEN type = 'generate' AND status = 'success' THEN 1 ELSE 0 END) AS generate_success,
      SUM(CASE WHEN type = 'generate' AND status = 'error' THEN 1 ELSE 0 END) AS generate_error,
      SUM(CASE WHEN type = 'download' THEN 1 ELSE 0 END) AS download_total,
      SUM(CASE WHEN type = 'download' AND status = 'success' THEN 1 ELSE 0 END) AS download_success,
      SUM(CASE WHEN type = 'download' AND status = 'error' THEN 1 ELSE 0 END) AS download_error
    FROM admin_events
  `) as [mysql.RowDataPacket[], unknown];
  const eventAgg = eventRows[0] || {};

  const [totalRows] = await db.query('SELECT COUNT(*) AS count FROM admin_visits') as [mysql.RowDataPacket[], unknown];
  const [uniqueRows] = await db.query('SELECT COUNT(DISTINCT visitor_key) AS count FROM admin_visits') as [mysql.RowDataPacket[], unknown];
  const todayKey = new Date().toISOString().slice(0, 10);
  const [todayRows] = await db.query('SELECT COUNT(*) AS count FROM admin_visits WHERE date_key = ?', [todayKey]) as [mysql.RowDataPacket[], unknown];
  const [todayUniqueRows] = await db.query('SELECT COUNT(DISTINCT visitor_key) AS count FROM admin_visits WHERE date_key = ?', [todayKey]) as [mysql.RowDataPacket[], unknown];
  const [last7Rows] = await db.query(`
    SELECT date_key AS \`date\`, COUNT(*) AS visits, COUNT(DISTINCT visitor_key) AS unique_visitors
    FROM admin_visits
    GROUP BY date_key
    ORDER BY date_key DESC
    LIMIT 7
  `) as [mysql.RowDataPacket[], unknown];

  return {
    generateTotal: Number(eventAgg.generate_total) || 0,
    generateSuccess: Number(eventAgg.generate_success) || 0,
    generateError: Number(eventAgg.generate_error) || 0,
    downloadTotal: Number(eventAgg.download_total) || 0,
    downloadSuccess: Number(eventAgg.download_success) || 0,
    downloadError: Number(eventAgg.download_error) || 0,
    totalVisits: Number(totalRows[0]?.count) || 0,
    uniqueVisitors: Number(uniqueRows[0]?.count) || 0,
    todayVisits: Number(todayRows[0]?.count) || 0,
    todayUniqueVisitors: Number(todayUniqueRows[0]?.count) || 0,
    last7Days: (last7Rows as Array<{ date: string; visits: number; unique_visitors: number }>).reverse().map((item) => ({
      date: item.date,
      visits: Number(item.visits),
      uniqueVisitors: Number(item.unique_visitors),
    })),
  };
}

export async function getRecentAdminEvents(limit = 80) {
  await ensureTables();
  const db = getPool();
  const [rows] = await db.query(
    `SELECT id, type, status, model, has_images AS hasImages, prompt_length AS promptLength,
            markdown_length AS markdownLength, error_message AS errorMessage, created_at AS createdAt
     FROM admin_events ORDER BY created_at DESC LIMIT ?`,
    [limit]
  ) as [mysql.RowDataPacket[], unknown];
  return rows as Array<{
    id: string;
    type: 'generate' | 'download';
    status: 'success' | 'error';
    model: string | null;
    hasImages: number | null;
    promptLength: number | null;
    markdownLength: number | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
}
