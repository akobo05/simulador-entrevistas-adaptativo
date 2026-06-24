import { loadEnv, EnvValidationError, type Env } from './config/env.js';
import { buildServer } from './server.js';
import { createDb, runMigrations } from './db/client.js';

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

  const db = createDb(env.DATABASE_URL);
  try {
    await runMigrations(db);
  } catch (err) {
    console.error('Fallo aplicando migraciones de la base de datos:');
    console.error(err);
    process.exit(1);
  }

  const server = await buildServer(env, { db });

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    server.log.info(`API levantada en http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Catch-all para rejections que no esten dentro de un try/catch interno
// (p. ej. `buildServer` fallando al registrar un plugin de Fastify).
// Sin esto, Node loguea un UnhandledPromiseRejection feo y el codigo
// de salida queda fuera de nuestro control.
main().catch((err: unknown) => {
  console.error('Fallo durante el arranque del backend:');
  console.error(err);
  process.exit(1);
});
