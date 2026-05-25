import { loadEnv, EnvValidationError, type Env } from './config/env.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  let env: Env;
  try {
    env = loadEnv();
  } catch (err) {
    if (err instanceof EnvValidationError) {
      console.error(err.message);
      console.error(JSON.stringify(err.issues, null, 2));
    } else {
      console.error(err);
    }
    process.exit(1);
  }

  const server = await buildServer(env);

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    server.log.info(`API levantada en http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

void main();
