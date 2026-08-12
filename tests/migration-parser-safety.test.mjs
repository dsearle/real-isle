import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationsDirectory = new URL("../drizzle/", import.meta.url);
const statementBreakpoint = "--> statement-breakpoint";

function migrationFiles() {
  return readdirSync(migrationsDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
}

function migrationNumber(file) {
  return Number(file.slice(0, 4));
}

function migrationStatements(file) {
  return readFileSync(new URL(file, migrationsDirectory), "utf8")
    .split(statementBreakpoint)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function isCreateTrigger(statement) {
  return /^CREATE\s+TRIGGER\b/i.test(statement);
}

function triggerName(statement) {
  return (
    statement.match(
      /^CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([^`"\s]+)/i,
    )?.[1] ?? "unknown trigger"
  );
}

function firstBeginEndStatement(statement) {
  const begin = /\bBEGIN\b/i.exec(statement);
  assert.ok(begin, `${triggerName(statement)} has no BEGIN token`);

  const bodyStart = begin.index + begin[0].length;
  const firstEnd = /\bEND\s*;/i.exec(statement.slice(bodyStart));
  assert.ok(firstEnd, `${triggerName(statement)} has no END terminator`);

  return statement.slice(0, bodyStart + firstEnd.index + firstEnd[0].length);
}

function quotedSqlStrings(statement) {
  return statement.match(/'(?:''|[^'])*'/g) ?? [];
}

test("migrations 0010-0020 keep trigger SQL safe for the Sites BEGIN/END splitter", () => {
  const files = migrationFiles().filter((file) => {
    const number = migrationNumber(file);
    return number >= 10 && number <= 20;
  });

  assert.deepEqual(
    files.map(migrationNumber),
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  );

  let triggerCount = 0;

  for (const file of files) {
    for (const statement of migrationStatements(file).filter(isCreateTrigger)) {
      triggerCount += 1;
      const name = triggerName(statement);

      assert.doesNotMatch(
        statement,
        /\bSELECT\s+CASE\b/i,
        `${file}: ${name} uses a statement-level CASE that the Sites splitter can mistake for the trigger END`,
      );
      assert.equal(
        firstBeginEndStatement(statement).trim(),
        statement.trim(),
        `${file}: ${name} contains an END terminator before the trigger END`,
      );

      for (const quotedText of quotedSqlStrings(statement)) {
        assert.equal(
          quotedText.includes(";"),
          false,
          `${file}: ${name} contains a semicolon inside quoted trigger text`,
        );
      }
    }
  }

  assert.ok(triggerCount > 0, "expected trigger definitions in migrations 0010-0020");
});

test("a fresh database accepts migrations through 0020 after Sites-style trigger splitting", () => {
  const db = new DatabaseSync(":memory:");

  try {
    for (const file of migrationFiles().filter((file) => migrationNumber(file) <= 20)) {
      for (const statement of migrationStatements(file)) {
        const sitesParsedStatement =
          migrationNumber(file) >= 10 && isCreateTrigger(statement)
            ? firstBeginEndStatement(statement)
            : statement;
        db.exec(sitesParsedStatement);
      }
    }

    const foreignKeyFailures = db.prepare("PRAGMA foreign_key_check").all();
    assert.deepEqual(foreignKeyFailures, []);

    const installedTriggers = db
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger'")
      .all();
    assert.ok(installedTriggers.length > 0, "expected fresh migrations to install triggers");
  } finally {
    db.close();
  }
});
