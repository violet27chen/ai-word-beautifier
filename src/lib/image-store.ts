// In-memory image store with TTL auto-cleanup
// Zero disk usage, no external dependencies

const store = new Map<string, { data: Buffer; expiresAt: number }>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.expiresAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export function saveImage(id: string, base64Data: string): Buffer {
  const clean = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
  const buf = Buffer.from(clean, 'base64');
  store.set(id, { data: buf, expiresAt: Date.now() + TTL_MS });
  return buf;
}

export function getImage(id: string): Buffer | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(id);
    return null;
  }
  return entry.data;
}
