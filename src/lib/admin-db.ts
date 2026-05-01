import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type AdminEventInput = {
  type: 'generate' | 'download';
  status: 'success' | 'error';
  model?: string;
  hasImages?: boolean;
  promptLength?: number;
  markdownLength?: number;
  errorMessage?: string;
};

type AdminDbHandle = {
  db: Database.Database;
};

const globalScope = globalThis as typeof globalThis & { __adminDbHandle__?: AdminDbHandle };

function resolveDbFilePath() {
  const configured = process.env.ADMIN_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), '.data', 'admin-metrics.sqlite');
}

function getDb() {
  if (globalScope.__adminDbHandle__) {
    return globalScope.__adminDbHandle__.db;
  }
  const dbFilePath = resolveDbFilePath();
  const dir = path.dirname(dbFilePath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbFilePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
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
    );
    CREATE TABLE IF NOT EXISTS admin_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_key TEXT NOT NULL,
      date_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_events_created_at ON admin_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_events_type ON admin_events(type);
    CREATE INDEX IF NOT EXISTS idx_admin_visits_date_key ON admin_visits(date_key);
    CREATE INDEX IF NOT EXISTS idx_admin_visits_visitor_key ON admin_visits(visitor_key);
  `);
  const exists = db.prepare(`SELECT value FROM admin_meta WHERE key = 'startedAt' LIMIT 1`).get() as { value?: string } | undefined;
  if (!exists?.value) {
    db.prepare(`INSERT OR REPLACE INTO admin_meta(key, value) VALUES('startedAt', ?)`).run(new Date().toISOString());
  }
  globalScope.__adminDbHandle__ = { db };
  return db;
}

export function insertAdminEvent(event: AdminEventInput) {
  const db = getDb();
  db.prepare(`
    INSERT INTO admin_events(
      id, type, status, model, has_images, prompt_length, markdown_length, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event.type,
    event.status,
    event.model || null,
    event.hasImages ? 1 : 0,
    Number.isFinite(event.promptLength) ? event.promptLength : null,
    Number.isFinite(event.markdownLength) ? event.markdownLength : null,
    event.errorMessage || null,
    new Date().toISOString(),
  );
}

export function insertAdminVisit(input: { visitorKey: string; dateKey?: string }) {
  const db = getDb();
  const dateKey = input.dateKey || new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO admin_visits(visitor_key, date_key, created_at) VALUES (?, ?, ?)
  `).run(input.visitorKey, dateKey, new Date().toISOString());
}

export function getAdminStartedAt() {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM admin_meta WHERE key = 'startedAt' LIMIT 1`).get() as { value?: string } | undefined;
  return row?.value || new Date().toISOString();
}

export function getAdminAggregates() {
  const db = getDb();
  const eventAgg = db.prepare(`
    SELECT
      SUM(CASE WHEN type = 'generate' THEN 1 ELSE 0 END) AS generate_total,
      SUM(CASE WHEN type = 'generate' AND status = 'success' THEN 1 ELSE 0 END) AS generate_success,
      SUM(CASE WHEN type = 'generate' AND status = 'error' THEN 1 ELSE 0 END) AS generate_error,
      SUM(CASE WHEN type = 'download' THEN 1 ELSE 0 END) AS download_total,
      SUM(CASE WHEN type = 'download' AND status = 'success' THEN 1 ELSE 0 END) AS download_success,
      SUM(CASE WHEN type = 'download' AND status = 'error' THEN 1 ELSE 0 END) AS download_error
    FROM admin_events
  `).get() as {
    generate_total?: number;
    generate_success?: number;
    generate_error?: number;
    download_total?: number;
    download_success?: number;
    download_error?: number;
  };
  const visitsTotal = db.prepare(`SELECT COUNT(*) AS count FROM admin_visits`).get() as { count?: number };
  const uniqueVisitors = db.prepare(`SELECT COUNT(DISTINCT visitor_key) AS count FROM admin_visits`).get() as { count?: number };
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayVisits = db.prepare(`SELECT COUNT(*) AS count FROM admin_visits WHERE date_key = ?`).get(todayKey) as { count?: number };
  const todayUnique = db.prepare(`SELECT COUNT(DISTINCT visitor_key) AS count FROM admin_visits WHERE date_key = ?`).get(todayKey) as { count?: number };
  const last7Days = db.prepare(`
    SELECT date_key AS date, COUNT(*) AS visits, COUNT(DISTINCT visitor_key) AS unique_visitors
    FROM admin_visits
    GROUP BY date_key
    ORDER BY date_key DESC
    LIMIT 7
  `).all() as Array<{ date: string; visits: number; unique_visitors: number }>;
  return {
    generateTotal: eventAgg.generate_total || 0,
    generateSuccess: eventAgg.generate_success || 0,
    generateError: eventAgg.generate_error || 0,
    downloadTotal: eventAgg.download_total || 0,
    downloadSuccess: eventAgg.download_success || 0,
    downloadError: eventAgg.download_error || 0,
    totalVisits: visitsTotal.count || 0,
    uniqueVisitors: uniqueVisitors.count || 0,
    todayVisits: todayVisits.count || 0,
    todayUniqueVisitors: todayUnique.count || 0,
    last7Days: last7Days.reverse().map((item) => ({
      date: item.date,
      visits: item.visits,
      uniqueVisitors: item.unique_visitors,
    })),
  };
}

export function getRecentAdminEvents(limit = 80) {
  const db = getDb();
  return db.prepare(`
    SELECT
      id,
      type,
      status,
      model,
      has_images AS hasImages,
      prompt_length AS promptLength,
      markdown_length AS markdownLength,
      error_message AS errorMessage,
      created_at AS createdAt
    FROM admin_events
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{
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
