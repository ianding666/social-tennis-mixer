import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Player, Session } from './types';

interface MixerDB extends DBSchema {
  players: {
    key: string;
    value: Player;
  };
  sessions: {
    key: string;
    value: Session;
  };
}

const DB_NAME = 'social-tennis-mixer';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MixerDB>> | null = null;

function getDb(): Promise<IDBPDatabase<MixerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MixerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('players')) {
          db.createObjectStore('players', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
      }
    });
  }
  return dbPromise;
}

export async function loadPlayers(): Promise<Player[]> {
  const db = await getDb();
  return db.getAll('players');
}

export async function savePlayer(player: Player): Promise<void> {
  const db = await getDb();
  await db.put('players', player);
}

export async function deletePlayer(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('players', id);
}

export async function loadSessions(): Promise<Session[]> {
  const db = await getDb();
  return db.getAll('sessions');
}

export async function saveSession(session: Session): Promise<void> {
  const db = await getDb();
  await db.put('sessions', session);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('sessions', id);
}

export interface BackupFile {
  app: 'social-tennis-mixer';
  version: number;
  exportedAt: string;
  players: Player[];
  sessions: Session[];
}

export async function exportBackup(): Promise<BackupFile> {
  const [players, sessions] = await Promise.all([loadPlayers(), loadSessions()]);
  return {
    app: 'social-tennis-mixer',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    players,
    sessions
  };
}

/** Replace all data with the contents of a backup file. Validates shape. */
export async function importBackup(data: unknown): Promise<void> {
  if (
    !data ||
    typeof data !== 'object' ||
    (data as BackupFile).app !== 'social-tennis-mixer' ||
    !Array.isArray((data as BackupFile).players) ||
    !Array.isArray((data as BackupFile).sessions)
  ) {
    throw new Error('This file is not a valid Social Tennis Mixer backup.');
  }
  const backup = data as BackupFile;
  const db = await getDb();
  const tx = db.transaction(['players', 'sessions'], 'readwrite');
  await tx.objectStore('players').clear();
  await tx.objectStore('sessions').clear();
  for (const p of backup.players) await tx.objectStore('players').put(p);
  for (const s of backup.sessions) await tx.objectStore('sessions').put(s);
  await tx.done;
}
