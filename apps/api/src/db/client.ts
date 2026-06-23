import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
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

// Aplica las migraciones generadas ejecutando su SQL sentencia por sentencia.
// Es agnostico del driver (db.execute existe en ambos), asi el mismo codigo
// migra pglite y Postgres real. drizzle-kit separa sentencias con un breakpoint.
export async function runMigrations(db: Db): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const content = await readFile(`${MIGRATIONS_DIR}/${file}`, 'utf8');
    for (const statement of content.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await db.execute(sql.raw(trimmed));
    }
  }
}
