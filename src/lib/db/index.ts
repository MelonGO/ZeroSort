import { invoke } from "@/lib/desktop-adapter";

interface DatabaseInstance {
  close: () => Promise<void>;
  execute: <T = unknown>(
    sql: string,
    params?: any[],
  ) => Promise<{ rowsAffected: number }>;
  select: <T = any>(sql: string, params?: any[]) => Promise<T>;
}

function createVitestDatabaseStub(): DatabaseInstance {
  return {
    close: async () => {},
    execute: async () => ({ rowsAffected: 0 }),
    select: async <T = any>() => [] as unknown as T,
  };
}

async function loadDatabase(): Promise<DatabaseInstance> {
  if (typeof process !== "undefined" && process.env.VITEST) {
    return createVitestDatabaseStub();
  }

  // Create a database wrapper that uses the Tauri command bridge
  return {
    close: async () => {
      // Host manages the database lifecycle
    },
    execute: async (sql: string, params: any[] = []) => {
      const changes = await invoke<number>("db:execute", { sql, params });
      return { rowsAffected: changes || 0 };
    },
    select: async (sql: string, params: any[] = []) => {
      return await invoke("db:select", { sql, params });
    },
  };
}

export const db = await loadDatabase();

/**
 * Initializes all database tables for notes, directories, and sync.
 *
 * @returns A promise that resolves when all databases are initialized.
 */
export async function initAllDatabases() {
  const { initNotesDb } = await import("./notes");
  const { initDirectoriesDb } = await import("./directories");
  const { initTagsDb } = await import("./tags");
  const { initNoteLinksDb } = await import("./noteLinks");
  const { initSyncRecordsDb } = await import("./syncRecords");
  const { initSyncProfilesDb } = await import("./syncProfiles");
  const { initSyncLogsDb } = await import("./syncLogs");

  // Core tables
  await initNotesDb();
  await initDirectoriesDb();
  await initTagsDb(); // Must run after initNotesDb (FK reference)
  await initNoteLinksDb(); // Must run after initNotesDb (FK reference)

  // Sync tables (three-way comparison model)
  await initSyncRecordsDb();
  await initSyncProfilesDb();
  await initSyncLogsDb();
}
