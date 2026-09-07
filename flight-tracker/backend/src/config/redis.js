import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Two clients: BullMQ requires maxRetriesPerRequest: null on its connection,
// so we keep a separate general-purpose cache client with normal defaults.
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
});

export const bullConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => console.error("[redis] cache client error:", err.message));
bullConnection.on("error", (err) => console.error("[redis] bullmq client error:", err.message));

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour, per spec — avoids re-billing paid APIs

export async function cacheGet(key) {
  const raw = await redis.get(key);
  return raw ? JSON.parse(raw) : null;
}

export async function cacheSet(key, value, ttlSeconds = CACHE_TTL_SECONDS) {
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
}
