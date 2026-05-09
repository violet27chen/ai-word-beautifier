import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB) || 0,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

const IMAGE_TTL = 600; // 10 minutes

export async function saveImageToRedis(id: string, base64Data: string): Promise<string> {
  await redis.connect().catch(() => {});
  const cleanBase64 = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
  await redis.set(`ai-word:img:${id}`, cleanBase64, 'EX', IMAGE_TTL);
  return cleanBase64;
}

export async function getImageFromRedis(id: string): Promise<Buffer | null> {
  await redis.connect().catch(() => {});
  const data = await redis.getBuffer(`ai-word:img:${id}`);
  return data;
}
