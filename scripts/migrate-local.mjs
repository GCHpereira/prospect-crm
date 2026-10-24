// Aplica migrations/*.sql no D1 LOCAL do `npm run dev` (via API do explorer local). Idempotente.
// Produção: use `cf d1 migrations apply <id-do-banco>` (com autorização).
import { readdirSync, readFileSync } from "node:fs";

const base = process.env.DEV_URL ?? "http://localhost:3000";
const explorer = `${base}/cdn-cgi/local/explorer/api/d1/database`;
// ID do D1 local (emulador do dev server; nada remoto): descoberto pela API do explorer.
const list = await (await fetch(explorer)).json();
const dbId = list.result?.find((d) => d.name === "DB")?.uuid;
if (!dbId) throw new Error("D1 local não encontrado; o dev server está rodando?");
const api = `${explorer}/${dbId}`;

async function run(sql, params = []) {
  const r = await fetch(`${api}/raw`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql, params }) });
  const j = await r.json();
  if (!j.success) throw new Error(JSON.stringify(j.errors));
  const res = j.result?.[0]?.results; if (!res) return []; return (res.rows ?? []).map((r) => Object.fromEntries(res.columns.map((c, i) => [c, r[i]])));
}

await run("CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
const done = new Set((await run("SELECT name FROM d1_migrations")).map((r) => r.name));
for (const f of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) continue;
  const sql = readFileSync(`migrations/${f}`, "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await run(stmt);
  await run("INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)", [f, new Date().toISOString()]);
  console.log("aplicada:", f);
}
console.log("ok");
