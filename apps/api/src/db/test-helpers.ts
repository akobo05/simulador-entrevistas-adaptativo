import { createDb, runMigrations, type Db } from './client.js';

// Base pglite limpia y migrada para cada test (instancia nueva en memoria).
export async function makeTestDb(): Promise<Db> {
  const db = createDb('mock://test');
  await runMigrations(db);
  return db;
}
