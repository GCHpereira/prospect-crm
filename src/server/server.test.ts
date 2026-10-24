import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { __setKeysForTests } from "./auth";
import { importPOST, interactionsPOST, leadDELETE, leadPATCH, leadsPOST, stateGET, templatesPUT } from "./handlers";
import { sqliteD1 } from "@/test/sqlite-d1";

const TEAM = "meuteam.cloudflareaccess.com";
const AUD = "aud-123";
const ME = "usuario@example.com";
const ORIGIN = "http://crm.test";

let priv: CryptoKey;
let other: CryptoKey;
let db: ReturnType<typeof sqliteD1>;

async function token(o: { email?: string | null; aud?: string; iss?: string; exp?: string; key?: CryptoKey; alg?: string } = {}) {
  const jwt = new SignJWT(o.email === null ? {} : { email: o.email ?? ME })
    .setProtectedHeader({ alg: o.alg ?? "RS256", kid: "k1" })
    .setIssuer(o.iss ?? `https://${TEAM}`)
    .setAudience(o.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(o.exp ?? "5m");
  return jwt.sign(o.key ?? priv);
}

type Opts = { method?: string; body?: unknown; tok?: string | null; origin?: string | null; ct?: string | null; raw?: string };
function req(path: string, o: Opts = {}) {
  const h = new Headers();
  if (o.tok) h.set("cf-access-jwt-assertion", o.tok);
  const method = o.method ?? "GET";
  if (method !== "GET") {
    if (o.origin !== null) h.set("origin", o.origin ?? ORIGIN);
    if (o.ct !== null) h.set("content-type", o.ct ?? "application/json");
  }
  return new Request(ORIGIN + path, { method, headers: h, body: method === "GET" ? undefined : (o.raw ?? JSON.stringify(o.body ?? {})) });
}
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });
const count = (t: string) => (db.raw.prepare(`SELECT count(*) c FROM ${t}`).get() as { c: number }).c;
const uid = () => crypto.randomUUID();
const lead = (o: Record<string, unknown> = {}) => ({ id: uid(), nome: "Estética Alfa", cidade: "Belo Horizonte", whatsapp: "(31) 98888-7777", ...o });

let tok: string;
const create = async (o: Record<string, unknown> = {}) => leadsPOST(req("/api/leads", { method: "POST", tok, body: lead(o) }), ctx());

beforeAll(async () => {
  const kp = await generateKeyPair("RS256");
  const kp2 = await generateKeyPair("RS256");
  priv = kp.privateKey;
  other = kp2.privateKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" } as JWK;
  __setKeysForTests(() => createLocalJWKSet({ keys: [jwk] }));
});

beforeEach(async () => {
  db = sqliteD1();
  Object.assign(env, { DB: db, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ALLOWED_EMAIL: ME });
  tok = await token();
  vi.unstubAllEnvs();
  vi.stubEnv("VITE_DEV_AUTH_BYPASS", "0"); // .env.local do desenvolvedor liga o atalho; os testes não dependem disso
});

describe("autenticação (Cloudflare Access)", () => {
  it("sem token: 401, e nada é lido", async () => {
    const r = await stateGET(req("/api/state"), ctx());
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "missing_token" });
  });
  it("token válido do e-mail autorizado: 200", async () => {
    expect((await stateGET(req("/api/state", { tok }), ctx())).status).toBe(200);
  });
  it("e-mail diferente (mesmo token válido do Access): 403", async () => {
    const r = await stateGET(req("/api/state", { tok: await token({ email: "intruso@example.com" }) }), ctx());
    expect(r.status).toBe(403);
  });
  it("e-mail comparado sem diferenciar maiúsculas", async () => {
    expect((await stateGET(req("/api/state", { tok: await token({ email: "USUARIO@Example.com" }) }), ctx())).status).toBe(200);
  });
  it("token sem e-mail (ex.: service token): 403", async () => {
    expect((await stateGET(req("/api/state", { tok: await token({ email: null }) }), ctx())).status).toBe(403);
  });
  it.each([
    ["audience errada", () => token({ aud: "outro-app" })],
    ["issuer errado", () => token({ iss: "https://evil.cloudflareaccess.com" })],
    ["expirado", () => token({ exp: "-1m" })],
    ["assinado com outra chave", () => token({ key: other })],
    ["lixo", async () => "abc.def.ghi"],
  ])("token inválido (%s): 401", async (_n, mk) => {
    expect((await stateGET(req("/api/state", { tok: await mk() }), ctx())).status).toBe(401);
  });
  it("alg=none é rejeitado", async () => {
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const t = `${b({ alg: "none", typ: "JWT" })}.${b({ email: ME, aud: AUD, iss: `https://${TEAM}`, exp: 9999999999 })}.`;
    expect((await stateGET(req("/api/state", { tok: t }), ctx())).status).toBe(401);
  });
  it("não confia em header de identidade comum (cf-access-authenticated-user-email)", async () => {
    const r = new Request(ORIGIN + "/api/state", { headers: { "cf-access-authenticated-user-email": ME } });
    expect((await stateGET(r, ctx())).status).toBe(401);
  });
  it("configuração ausente ou inválida fecha tudo (503)", async () => {
    for (const patch of [{ ACCESS_AUD: "" }, { ALLOWED_EMAIL: "" }, { ACCESS_TEAM_DOMAIN: "evil.com" }, { ACCESS_TEAM_DOMAIN: undefined }]) {
      Object.assign(env, patch);
      expect((await stateGET(req("/api/state", { tok }), ctx())).status).toBe(503);
      Object.assign(env, { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ALLOWED_EMAIL: ME });
    }
  });
  it("atalho de desenvolvimento só vale quando import.meta.env.DEV é true", async () => {
    vi.stubEnv("VITE_DEV_AUTH_BYPASS", "1");
    vi.stubEnv("DEV", true);
    expect((await stateGET(req("/api/state"), ctx())).status).toBe(200);
    vi.stubEnv("DEV", false); // como no build de produção
    expect((await stateGET(req("/api/state"), ctx())).status).toBe(401);
  });
});

describe("gravações não autorizadas", () => {
  const writes: [string, () => Promise<Response>][] = [
    ["criar lead", () => leadsPOST(req("/api/leads", { method: "POST", body: lead() }), ctx())],
    ["editar lead", () => leadPATCH(req("/api/leads/x", { method: "PATCH", body: { nome: "Hack" } }), ctx({ id: uid() }))],
    ["excluir lead", () => leadDELETE(req("/api/leads/x", { method: "DELETE" }), ctx({ id: uid() }))],
    ["interação", () => interactionsPOST(req("/api/interactions", { method: "POST", body: { id: uid(), lead_id: uid(), tipo: "nota" } }), ctx())],
    ["templates", () => templatesPUT(req("/api/templates", { method: "PUT", body: { com_decisor: "x", sem_decisor: "y" } }), ctx())],
    ["importação", () => importPOST(req("/api/import", { method: "POST", body: {} }), ctx())],
  ];
  it.each(writes)("sem login: %s → 401 e banco intacto", async (_n, f) => {
    expect((await f()).status).toBe(401);
    expect(count("leads") + count("interactions") + count("message_templates") + count("import_batches")).toBe(0);
  });
  it("e-mail não autorizado não grava", async () => {
    const t = await token({ email: "intruso@example.com" });
    const r = await leadsPOST(req("/api/leads", { method: "POST", tok: t, body: lead() }), ctx());
    expect(r.status).toBe(403);
    expect(count("leads")).toBe(0);
  });
  it("CSRF: sem Origin, Origin de outro site ou corpo não-JSON são recusados", async () => {
    for (const [o, status] of [
      [{ origin: null }, 403],
      [{ origin: "https://evil.example" }, 403],
      [{ ct: "text/plain" }, 415],
      [{ ct: "application/x-www-form-urlencoded" }, 415],
    ] as [Opts, number][]) {
      const r = await leadsPOST(req("/api/leads", { method: "POST", tok, body: lead(), ...o }), ctx());
      expect(r.status).toBe(status);
    }
    expect(count("leads")).toBe(0);
  });
});

describe("validação de entrada", () => {
  const bad: [string, Record<string, unknown>][] = [
    ["sem nome", { nome: undefined }],
    ["nome curto", { nome: "A" }],
    ["cnpj inválido", { cnpj: "12.345.678/0001-00" }],
    ["nota fora da faixa", { nota_google: 9 }],
    ["prioridade fora da faixa", { prioridade: 101 }],
    ["telefone inválido", { whatsapp: "123" }],
    ["url sem http", { site: "javascript:alert(1)" }],
    ["status inexistente", { status: "pago" }],
    ["id não-uuid", { id: "1; DROP TABLE leads" }],
    ["data inválida", { pesquisado_em: "ontem" }],
    ["texto gigante", { observacoes: "x".repeat(4001) }],
  ];
  it.each(bad)("rejeita %s (422)", async (_n, o) => {
    const r = await create(o);
    expect(r.status).toBe(422);
    expect(count("leads")).toBe(0);
  });
  it("corpo inválido: JSON quebrado (400) e grande demais (413)", async () => {
    expect((await leadsPOST(req("/api/leads", { method: "POST", tok, raw: "{nao json" }), ctx())).status).toBe(400);
    expect((await leadsPOST(req("/api/leads", { method: "POST", tok, raw: JSON.stringify({ x: "y".repeat(70_000) }) }), ctx())).status).toBe(413);
  });
  it("injeção de SQL vira texto literal (consultas parametrizadas)", async () => {
    const evil = "Robert'); DROP TABLE leads;--";
    const r = await create({ nome: evil });
    expect(r.status).toBe(201);
    expect(count("leads")).toBe(1);
    expect(((await r.json()) as { nome: string }).nome).toBe(evil);
    const id = ((await (await stateGET(req("/api/state", { tok }), ctx())).json()) as { leads: { id: string }[] }).leads[0].id;
    const p = await leadPATCH(req(`/api/leads/${id}`, { method: "PATCH", tok, body: { observacoes: "' OR 1=1 --" } }), ctx({ id }));
    expect(p.status).toBe(200);
  });
  it("campos de controle enviados pelo cliente são ignorados", async () => {
    const r = await create({ origem: "csv", import_batch_id: "x", dedupe_key: "x", created_at: "2000-01-01", possivel_duplicado_de: uid() });
    const l = (await r.json()) as Record<string, unknown>;
    expect(l.origem).toBe("manual");
    expect(l.import_batch_id).toBeNull();
    expect(l.created_at).not.toBe("2000-01-01");
    expect(l.dedupe_key).toBe("estetica alfa|belo horizonte");
    expect(l.possivel_duplicado_de).toBeNull();
  });
  it("PATCH vazio ou com id inválido", async () => {
    const l = (await (await create()).json()) as { id: string };
    expect((await leadPATCH(req("/api/leads/x", { method: "PATCH", tok, body: {} }), ctx({ id: l.id }))).status).toBe(422);
    expect((await leadPATCH(req("/api/leads/x", { method: "PATCH", tok, body: { nome: "Novo Nome" } }), ctx({ id: "nao-uuid" }))).status).toBe(404);
    expect((await leadPATCH(req("/api/leads/x", { method: "PATCH", tok, body: { nome: "Novo Nome" } }), ctx({ id: uid() }))).status).toBe(404);
  });
});

describe("persistência no banco", () => {
  it("cria, lê, edita, muda status (com histórico) e exclui (cascata)", async () => {
    const r = await create({ segmento: "Estética", nota_google: 4.8, qtd_avaliacoes: 120, cnpj: "11.222.333/0001-81" });
    expect(r.status).toBe(201);
    const l = (await r.json()) as { id: string; cnpj: string; status: string };
    expect(l.cnpj).toBe("11222333000181");
    expect(l.status).toBe("novo");

    const st = (await (await stateGET(req("/api/state", { tok }), ctx())).json()) as { leads: { id: string; nota_google: number }[]; interactions: unknown[] };
    expect(st.leads).toHaveLength(1);
    expect(st.leads[0].nota_google).toBe(4.8);

    const p = await leadPATCH(req("/x", { method: "PATCH", tok, body: { status: "respondeu", decisor_nome: "Carlos" } }), ctx({ id: l.id }));
    expect(p.status).toBe(200);
    expect(((await p.json()) as { status: string }).status).toBe("respondeu");

    const i = await interactionsPOST(req("/x", { method: "POST", tok, body: { id: uid(), lead_id: l.id, tipo: "mensagem_enviada", canal: "WhatsApp", acompanhar_em: "2026-11-01" } }), ctx());
    expect(i.status).toBe(201);

    const st2 = (await (await stateGET(req("/api/state", { tok }), ctx())).json()) as { interactions: { tipo: string }[] };
    expect(st2.interactions.map((x) => x.tipo).sort()).toEqual(["mensagem_enviada", "status_alterado"]);

    expect((await leadDELETE(req("/x", { method: "DELETE", tok }), ctx({ id: l.id }))).status).toBe(200);
    expect(count("leads")).toBe(0);
    expect(count("interactions")).toBe(0);
    expect((await leadDELETE(req("/x", { method: "DELETE", tok }), ctx({ id: l.id }))).status).toBe(404);
  });
  it("interação em lead inexistente é recusada", async () => {
    const r = await interactionsPOST(req("/x", { method: "POST", tok, body: { id: uid(), lead_id: uid(), tipo: "nota" } }), ctx());
    expect(r.status).toBe(404);
  });
  it("templates: padrão, salvar e ler de novo", async () => {
    const get = async () => ((await (await stateGET(req("/api/state", { tok }), ctx())).json()) as { templates: { com_decisor: string } }).templates;
    expect((await get()).com_decisor).toContain("{decisor}");
    const r = await templatesPUT(req("/x", { method: "PUT", tok, body: { com_decisor: "Oi {decisor}, da {empresa}", sem_decisor: "Oi, {empresa}" } }), ctx());
    expect(r.status).toBe(200);
    expect((await get()).com_decisor).toBe("Oi {decisor}, da {empresa}");
    expect((await templatesPUT(req("/x", { method: "PUT", tok, body: { com_decisor: "", sem_decisor: "ok" } }), ctx())).status).toBe(422);
  });
});

describe("prevenção de duplicados (cadastro manual)", () => {
  it("mesmo ID do Google Maps ou CNPJ: 409", async () => {
    expect((await create({ google_place_id: "p1" })).status).toBe(201);
    expect((await create({ nome: "Outro Nome", google_place_id: "p1" })).status).toBe(409);
    expect((await create({ nome: "Empresa Cnpj", cnpj: "11222333000181" })).status).toBe(201);
    expect((await create({ nome: "Empresa Cnpj Dois", cnpj: "11.222.333/0001-81" })).status).toBe(409);
    expect(count("leads")).toBe(2);
  });
  it("mesmo nome e cidade: cria, mas sinaliza possível duplicado", async () => {
    const a = (await (await create()).json()) as { id: string };
    const b = (await (await create({ nome: "ESTÉTICA alfa" })).json()) as { possivel_duplicado_de: string };
    expect(b.possivel_duplicado_de).toBe(a.id);
  });
});

describe("importação", () => {
  const H = ["Empresa", "Cidade", "Nota", "WhatsApp", "Place ID", "Observações"];
  const map = { nome: 0, cidade: 1, nota_google: 2, whatsapp: 3, google_place_id: 4, observacoes: 5 };
  const imp = async (table: unknown[][], extra: Record<string, unknown> = {}) => {
    const r = await importPOST(req("/api/import", { method: "POST", tok, body: { arquivo: "t.csv", kind: "csv", table: [H, ...table], mapping: map, ...extra } }), ctx());
    return { status: r.status, body: (await r.json()) as Record<string, number> };
  };

  it("importa, e reimportar o mesmo arquivo não duplica", async () => {
    const rows = [
      ["Alfa Auto", "BH", "4,8", "(31) 98888-1111", "p1", ""],
      ["Beta Pet", "Contagem", "4.6", "(31) 3222-1000", "p2", ""],
      ["", "BH", "4", "(31) 98888-2222", "", ""],
      ["Sem Fone", "BH", "4", "", "", ""],
    ];
    const a = await imp(rows);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ total: 4, novos: 2, invalidos: 2, atualizados: 0 });
    expect(count("leads")).toBe(2);
    expect(count("import_batches")).toBe(1);
    const b = await imp(rows);
    expect(b.body).toMatchObject({ novos: 0, atualizados: 2, invalidos: 2 });
    expect(count("leads")).toBe(2);
  });
  it("não sobrescreve edições manuais; só completa campos vazios", async () => {
    await imp([["Alfa Auto", "BH", "4,8", "(31) 98888-1111", "p1", "da planilha"]]);
    const id = (db.raw.prepare("SELECT id FROM leads").get() as { id: string }).id;
    await leadPATCH(req("/x", { method: "PATCH", tok, body: { observacoes: "minha anotação", status: "negociacao", nota_google: 3.1, decisor_nome: "" } }), ctx({ id }));
    db.raw.prepare("UPDATE leads SET segmento = '' , whatsapp = '' WHERE id = ?").run(id);
    await imp([["Alfa Auto", "BH", "4,9", "(31) 97777-0000", "p1", "outra obs"]]);
    const row = db.raw.prepare("SELECT observacoes, status, nota_google, whatsapp FROM leads").get() as Record<string, unknown>;
    expect(row.observacoes).toBe("minha anotação");
    expect(row.status).toBe("negociacao");
    expect(row.nota_google).toBe(3.1);
    expect(row.whatsapp).toBe("(31) 97777-0000"); // estava vazio: completado
  });
  it("nome+cidade iguais é só 'possível duplicado': não cria sem confirmação", async () => {
    await create({ nome: "Alfa Auto", cidade: "BH" });
    const a = await imp([["Alfa Auto", "BH", "4,8", "(31) 98888-1111", "", ""]]);
    expect(a.body).toMatchObject({ novos: 0, duplicados: 1 });
    expect(count("leads")).toBe(1);
    const b = await imp([["Alfa Auto", "BH", "4,8", "(31) 98888-1111", "", ""]], { criarNovos: [2] });
    expect(b.body).toMatchObject({ novos: 1, sinalizados: 1 });
    expect(count("leads")).toBe(2);
    expect((db.raw.prepare("SELECT count(*) c FROM leads WHERE possivel_duplicado_de IS NOT NULL").get() as { c: number }).c).toBe(1);
  });
  it("neutraliza fórmulas de planilha", async () => {
    await imp([["=HYPERLINK(\"http://x\")", "BH", "4", "(31) 98888-1111", "", ""]]);
    expect((db.raw.prepare("SELECT nome FROM leads").get() as { nome: string }).nome.startsWith("'=")).toBe(true);
  });
  it("revalida no servidor: tabela/mapeamento malformados são recusados", async () => {
    for (const body of [
      { arquivo: "t.csv", kind: "csv", table: [H], mapping: map }, // sem linhas
      { arquivo: "t.csv", kind: "exe", table: [H, ["a"]], mapping: map },
      { arquivo: "t.csv", kind: "csv", table: [H, ["a"]], mapping: { campo_inexistente: 0 } },
      { arquivo: "t.csv", kind: "csv", table: [H, [{ x: 1 }]], mapping: map },
      { arquivo: "t.csv", kind: "csv", table: Array.from({ length: 502 }, () => H), mapping: map }, // > 500 linhas
    ]) {
      const r = await importPOST(req("/api/import", { method: "POST", tok, body }), ctx());
      expect(r.status).toBe(422);
    }
    expect(count("leads")).toBe(0);
  });
  it("500 linhas entram de uma vez, em poucas consultas (limite do D1: 50 por invocação)", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => [`Empresa ${i}`, "BH", "4.5", `(31) 9${String(8000 + i).padStart(4, "0")}-1111`, `p${i}`, ""]);
    const spy = vi.spyOn(db, "prepare");
    const a = await imp(rows);
    expect(a.body.novos).toBe(500);
    expect(count("leads")).toBe(500);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(6);
  });
  it("o lote é atômico: falha no meio não deixa linhas parciais", async () => {
    const stmts = [
      db.prepare("INSERT INTO import_batches (id, arquivo, origem, created_at) VALUES ('b1', 'x', 'csv', 't')"),
      db.prepare("INSERT INTO leads (id, nome, cidade, dedupe_key, created_at, updated_at) VALUES ('1', 'Alfa', 'BH', 'k', 't', 't')"),
      db.prepare("INSERT INTO leads (id, nome, cidade, status, dedupe_key, created_at, updated_at) VALUES ('2', 'Beta', 'BH', 'invalido', 'k', 't', 't')"),
    ];
    await expect(db.batch(stmts)).rejects.toThrow();
    expect(count("leads") + count("import_batches")).toBe(0);
  });
});

describe("exclusão de leads", () => {
  // O navegador envia DELETE com Origin, mas sem corpo e sem content-type (era o que causava 415 em produção).
  const del = (id: string, o: Opts = {}) => leadDELETE(req(`/api/leads/${id}`, { method: "DELETE", tok, ct: null, ...o }), ctx({ id }));
  const mkLead = async (o: Record<string, unknown> = {}) => ((await (await create(o)).json()) as { id: string }).id;
  const note = (lead_id: string) =>
    interactionsPOST(req("/api/interactions", { method: "POST", tok, body: { id: uid(), lead_id, tipo: "nota", observacao: "x" } }), ctx());
  const ids = (t: string) => (db.raw.prepare(`SELECT id FROM ${t}`).all() as { id: string }[]).map((r) => r.id);

  it("DELETE como o navegador faz (sem content-type): 200 e o registro some do banco", async () => {
    const id = await mkLead();
    const r = await del(id);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(ids("leads")).toEqual([]);
  });
  it("lead sem interações", async () => {
    const a = await mkLead();
    const b = await mkLead({ nome: "Outra Empresa", whatsapp: "(31) 97777-1111" });
    expect((await del(a)).status).toBe(200);
    expect(ids("leads")).toEqual([b]);
  });
  it("lead com interações: o histórico dele é excluído em cascata, o dos outros não", async () => {
    const a = await mkLead();
    const b = await mkLead({ nome: "Outra Empresa", whatsapp: "(31) 97777-1111" });
    await note(a);
    await note(a);
    await leadPATCH(req("/x", { method: "PATCH", tok, body: { status: "respondeu" } }), ctx({ id: a })); // gera status_alterado
    await note(b);
    expect(count("interactions")).toBe(4);
    expect((await del(a)).status).toBe(200);
    expect(count("interactions")).toBe(1);
    expect((db.raw.prepare("SELECT lead_id FROM interactions").get() as { lead_id: string }).lead_id).toBe(b);
    expect(ids("leads")).toEqual([b]);
  });
  it("lead apontado como 'possível duplicado' por outro: exclui sem erro e limpa a referência", async () => {
    const a = await mkLead();
    const b = await mkLead({ whatsapp: "(31) 97777-1111" }); // mesmo nome e cidade: possivel_duplicado_de = a
    expect((db.raw.prepare("SELECT possivel_duplicado_de p FROM leads WHERE id = ?").get(b) as { p: string }).p).toBe(a);
    expect((await del(a)).status).toBe(200);
    expect((db.raw.prepare("SELECT possivel_duplicado_de p FROM leads WHERE id = ?").get(b) as { p: string | null }).p).toBeNull();
  });
  it("lead criado por importação (com lote) também é excluído, e o lote permanece", async () => {
    const H = ["Empresa", "Cidade", "WhatsApp", "Place ID"];
    await importPOST(req("/api/import", { method: "POST", tok, body: { arquivo: "a.csv", kind: "csv", table: [H, ["Imp", "BH", "(31) 98888-1111", "p1"]], mapping: { nome: 0, cidade: 1, whatsapp: 2, google_place_id: 3 } } }), ctx());
    const [id] = ids("leads");
    expect((await del(id)).status).toBe(200);
    expect(count("leads")).toBe(0);
    expect(count("import_batches")).toBe(1);
  });
  it("lead inexistente ou id inválido: 404, sem afetar nada", async () => {
    const a = await mkLead();
    expect((await del(uid())).status).toBe(404);
    expect((await del("nao-uuid")).status).toBe(404);
    expect(ids("leads")).toEqual([a]);
  });
  it("sem login, com e-mail barrado, sem Origin ou de outro site: nada é excluído", async () => {
    const a = await mkLead();
    await note(a);
    for (const [o, status] of [
      [{ tok: "" }, 401],
      [{ tok: await token({ email: "intruso@example.com" }) }, 403],
      [{ origin: null }, 403],
      [{ origin: "https://evil.example" }, 403],
    ] as [Opts, number][]) {
      expect((await del(a, o)).status).toBe(status);
    }
    expect(ids("leads")).toEqual([a]);
    expect(count("interactions")).toBe(1);
  });
  it("excluir duas vezes: a segunda dá 404 (a interface trata como já excluído)", async () => {
    const a = await mkLead();
    expect((await del(a)).status).toBe(200);
    expect((await del(a)).status).toBe(404);
  });
});
