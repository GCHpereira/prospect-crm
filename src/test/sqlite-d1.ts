import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { D1Like, D1Stmt } from "@/server/d1";

/** D1 de mentira sobre SQLite real (mesmo motor do D1): batch = transação atômica. */
export function sqliteD1(): D1Like & { raw: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(`migrations/${f}`, "utf8"));

  const mk = (sql: string, binds: unknown[] = []): D1Stmt & { sql: string; binds: unknown[] } => ({
    sql,
    binds,
    bind: (...v) => mk(sql, v),
    all: async <T,>() => ({ results: db.prepare(sql).all(...(binds as never[])) as T[] }),
    first: async <T,>() => (db.prepare(sql).get(...(binds as never[])) as T | undefined) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(binds as never[])).changes) } }),
  });
  return {
    raw: db,
    prepare: (sql) => mk(sql),
    batch: async (stmts) => {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => {
          const m = s as ReturnType<typeof mk>;
          return db.prepare(m.sql).run(...(m.binds as never[]));
        });
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
