/**
 * Per-repo memory store.
 *
 * Stores patterns maintainers have explicitly marked as "not an issue"
 * (via a 👎 reaction handled in github/handleFeedback.ts). The agent
 * consults this before including a finding in its review — see
 * ARCHITECTURE.md decision 3 for why this is explicit-feedback-only
 * rather than self-adjusting.
 */

import Database from "better-sqlite3";
import { config } from "../config";
import { SuppressedPattern } from "../types";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(config.memoryDbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppressed_patterns (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      repo             TEXT NOT NULL,
      rule_id          TEXT NOT NULL,
      filename_pattern TEXT NOT NULL,
      reason           TEXT NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(repo, rule_id, filename_pattern)
    );
  `);
  return db;
}

export function addSuppression(pattern: Omit<SuppressedPattern, "createdAt">): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO suppressed_patterns (repo, rule_id, filename_pattern, reason)
       VALUES (?, ?, ?, ?)`
    )
    .run(pattern.repo, pattern.ruleId, pattern.filenamePattern, pattern.reason);
}

export function getSuppressions(repo: string): SuppressedPattern[] {
  const rows = getDb()
    .prepare(
      `SELECT repo, rule_id as ruleId, filename_pattern as filenamePattern,
              reason, created_at as createdAt
       FROM suppressed_patterns WHERE repo = ?`
    )
    .all(repo) as SuppressedPattern[];
  return rows;
}

/**
 * Simple glob-ish matcher: filenamePattern may contain `*` as a wildcard.
 * Kept intentionally simple — this isn't meant to be a full glob
 * implementation, just enough for patterns like "*.test.ts" or "src/legacy/*".
 */
function matchesPattern(filename: string, pattern: string): boolean {
  const regexStr = "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
  return new RegExp(regexStr).test(filename);
}

export function isSuppressed(
  repo: string,
  ruleId: string | null,
  filename: string
): boolean {
  if (!ruleId) return false;
  const suppressions = getSuppressions(repo);
  return suppressions.some(
    (s) => s.ruleId === ruleId && matchesPattern(filename, s.filenamePattern)
  );
}

export function closeMemoryStore(): void {
  db?.close();
  db = null;
}
