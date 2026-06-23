import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const RedisMock = require('ioredis-mock');
const redis = new RedisMock();

const crypto = require('node:crypto');

const sessionId = crypto.randomUUID();
const token = crypto.randomBytes(32).toString('hex');
const state = {
  id: sessionId,
  industry: 'backend',
  level: 'junior',
  status: 'active',
  phase: 'warmup',
  turnNumber: 0,
  startedAt: Date.now(),
  token,
};

try {
  const result = await redis.set(`session:${sessionId}`, JSON.stringify(state), 'EX', 3600);
  console.log('redis.set OK:', result);
} catch (e) {
  console.log('redis.set ERROR:', e.message);
}
