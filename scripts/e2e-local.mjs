// Teste ponta a ponta contra `npm run dev` (workerd + D1 local, atalho de dev ligado).
// Uso: node scripts/migrate-local.mjs && node scripts/e2e-local.mjs [write|read]
const base = process.env.DEV_URL ?? "http://localhost:3000";
const H = { origin: base, "content-type": "application/json" };
const call = async (m, p, b, h = H) => {
  const r = await fetch(base + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const ok = (c, msg) => { console.log((c ? "OK   " : "FALHA") + " " + msg); if (!c) process.exitCode = 1; };

if ((process.argv[2] ?? "write") === "write") {
  const id = crypto.randomUUID();
  let r = await call("POST", "/api/leads", { id, nome: "E2E Estética", cidade: "Belo Horizonte", whatsapp: "(31) 98888-1234", google_place_id: "e2e-1" });
  ok(r.status === 201, "cria lead (201)");
  r = await call("POST", "/api/leads", { id: crypto.randomUUID(), nome: "Outro", cidade: "BH", google_place_id: "e2e-1" });
  ok(r.status === 409, "place_id repetido → 409");
  r = await call("PATCH", `/api/leads/${id}`, { status: "respondeu", observacoes: "anotação manual" });
  ok(r.status === 200 && r.body.status === "respondeu", "muda status e observações");
  r = await call("POST", "/api/interactions", { id: crypto.randomUUID(), lead_id: id, tipo: "mensagem_enviada", canal: "WhatsApp" });
  ok(r.status === 201, "registra interação");
  r = await call("POST", "/api/leads", { id: crypto.randomUUID(), nome: "Sem origem", cidade: "BH" }, { "content-type": "application/json" });
  ok(r.status === 403, "POST sem Origin → 403 (CSRF)");
  const table = [["Empresa", "Cidade", "Nota", "WhatsApp", "Place ID"], ["Import A", "BH", "4,7", "(31) 98888-0001", "imp-a"], ["Import B", "Betim", "4,5", "(31) 3222-0002", "imp-b"], ["", "BH", "4", "", ""]];
  const mapping = { nome: 0, cidade: 1, nota_google: 2, whatsapp: 3, google_place_id: 4 };
  r = await call("POST", "/api/import", { arquivo: "e2e.csv", kind: "csv", table, mapping });
  ok(r.status === 200 && r.body.novos === 2 && r.body.invalidos === 1, `importa (novos=${r.body?.novos}, inválidos=${r.body?.invalidos})`);
  r = await call("POST", "/api/import", { arquivo: "e2e.csv", kind: "csv", table, mapping });
  ok(r.status === 200 && r.body.novos === 0 && r.body.atualizados === 2, "reimportação não duplica");
  // DELETE como o navegador: com Origin, sem corpo e sem content-type
  const tmp = crypto.randomUUID();
  await call("POST", "/api/leads", { id: tmp, nome: "E2E Excluir", cidade: "BH" });
  await call("POST", "/api/interactions", { id: crypto.randomUUID(), lead_id: tmp, tipo: "nota" });
  r = await call("DELETE", `/api/leads/${tmp}`, undefined, { origin: base });
  ok(r.status === 200, "DELETE sem content-type (como o navegador) → 200");
  r = await call("PUT", "/api/templates", { com_decisor: "Oi {decisor} ({empresa})", sem_decisor: "Oi, responsável da {empresa}?" });
  ok(r.status === 200, "salva templates");
}
const s = await call("GET", "/api/state");
ok(s.status === 200, "lê estado");
console.log("leads:", s.body.leads.length, "| interações:", s.body.interactions.length, "| template:", s.body.templates.com_decisor);
ok(s.body.leads.some((l) => l.nome === "E2E Estética" && l.status === "respondeu" && l.observacoes === "anotação manual"), "dados persistidos");
