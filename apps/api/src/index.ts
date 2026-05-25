import { loadEnv } from './config/env.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const server = await buildServer();

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    server.log.info(`API levantada en http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

void main();
