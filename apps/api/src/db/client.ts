import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

// Tipo comun a los dos drivers: tanto PgliteDatabase como PostgresJsDatabase
// extienden PgDatabase, asi el repositorio es agnostico del driver.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const require = createRequire(import.meta.url);
// Carpeta de migraciones relativa a este archivo (apps/api/drizzle).
const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

// Construye la instancia drizzle. Con prefijo mock:// usa pglite en proceso
// (dev sin infra y tests), cargado dinamicamente para no arrastrar
// @electric-sql/pglite al bundle de produccion (igual que #64 con ioredis-mock).
export function createDb(databaseUrl: string): Db {
  if (databaseUrl.startsWith('mock://')) {
    const { PGlite } = require('@electric-sql/pglite');
    const { drizzle: drizzlePglite } = require('drizzle-orm/pglite');
    return drizzlePglite(new PGlite(), { schema }) as Db;
  }
  return drizzlePostgres(postgres(databaseUrl), { schema });
}

// Aplica las migraciones generadas con el migrador nativo de drizzle, que crea
// la tabla de control __drizzle_migrations y saltea lo ya aplicado (idempotente,
// y maneja bien migraciones futuras). El migrador es especifico del driver: el
// de pglite arrastra @electric-sql/pglite, asi que se carga dinamicamente (igual
// que el driver) para no contaminar el bundle de produccion.
export async function runMigrations(db: Db, databaseUrl: string): Promise<void> {
  const config = { migrationsFolder: MIGRATIONS_DIR };
  if (databaseUrl.startsWith('mock://')) {
    const { migrate } = require('drizzle-orm/pglite/migrator');
    await migrate(db, config);
  } else {
    const { migrate } = require('drizzle-orm/postgres-js/migrator');
    await migrate(db, config);
  }
}
