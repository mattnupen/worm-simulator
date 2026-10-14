import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Everything Burrow Board keeps, in one SQLite file (DATA_DIR/board.db on Render's disk). What it
 * stores is kept small on purpose (framework P14): a random nickname and class period per student,
 * their cards, notes and pictures, and timestamps. No names, emails, IP addresses or analytics.
 * "Delete everything" in the teacher view empties every table.
 */
export function openDb(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      nickname TEXT NOT NULL,
      period INTEGER NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS teacher_sessions (token_hash TEXT PRIMARY KEY, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS boards (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL DEFAULT '',
      choices TEXT NOT NULL DEFAULT '[]',
      facts TEXT NOT NULL DEFAULT '[]',
      twists TEXT NOT NULL DEFAULT '[]',
      phase TEXT NOT NULL DEFAULT 'setup',
      areas TEXT NOT NULL DEFAULT '[]',
      rev INTEGER NOT NULL DEFAULT 1,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      board TEXT NOT NULL REFERENCES boards(slug) ON DELETE CASCADE,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board TEXT NOT NULL REFERENCES boards(slug) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'idea',
      author TEXT NOT NULL,
      period INTEGER,
      nickname TEXT NOT NULL,
      choice TEXT NOT NULL DEFAULT '',
      choice_other TEXT NOT NULL DEFAULT '',
      area_override TEXT,
      fact_ref TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      does TEXT NOT NULL DEFAULT '',
      notice TEXT NOT NULL DEFAULT '',
      changed TEXT NOT NULL DEFAULT '',
      twist TEXT NOT NULL DEFAULT '',
      image_id TEXT REFERENCES images(id) ON DELETE SET NULL,
      status TEXT,
      status_note TEXT NOT NULL DEFAULT '',
      hidden INTEGER NOT NULL DEFAULT 0,
      x REAL,
      y REAL,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cards_board ON cards(board);
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      period INTEGER,
      nickname TEXT NOT NULL,
      text TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL
    );
  `);
  return db;
}

export function getSetting(db: DatabaseSync, key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

/** Empties every table: the teacher's "Delete everything" (P14: delete responses at project end). */
export function wipe(db: DatabaseSync): void {
  db.exec('DELETE FROM notes; DELETE FROM cards; DELETE FROM images; DELETE FROM boards; DELETE FROM students; DELETE FROM teacher_sessions; DELETE FROM settings; VACUUM;');
}
