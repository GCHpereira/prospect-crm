import { dedupeKey } from "@/lib/dedupe";
import { applyImport, parseRows, type ImportReport, type Mapping } from "@/lib/import";
import { DEFAULT_TEMPLATES, EMPTY_LEAD, type Interaction, type Lead, type Status, type Templates } from "@/lib/types";
import type { D1Like } from "./d1";
import { LEAD_FIELDS } from "./schemas";

export class RepoError extends Error {
  constructor(public status: 404 | 409 | 422, message: string) {
    super(message);
  }
}

const now = () => new Date().toISOString();
const isUnique = (e: unknown) => e instanceof Error && /UNIQUE constraint failed/i.test(e.message);

// Colunas inseridas em `leads` (ordem fixa; nunca vêm de entrada do usuário).
const INSERT_COLS = [
  "id", "nome", "segmento", "cidade", "bairro", "endereco", "google_maps_url", "google_place_id", "nota_google",
  "qtd_avaliacoes", "site", "instagram", "cnpj", "decisor_nome", "decisor_cargo", "decisor_confianca",
  "decisor_canal_url", "telefone", "whatsapp", "numero_preferido", "oportunidade", "prioridade",
  "prioridade_justificativa", "fonte", "pesquisado_em", "verificado_em", "observacoes", "status", "origem",
  "import_batch_id", "dedupe_key", "possivel_duplicado_de", "created_at", "updated_at",
] as const;
const COLS_SQL = INSERT_COLS.join(", ");
const PLACEHOLDERS = INSERT_COLS.map(() => "?").join(", ");

const nul = (v: unknown) => (v === "" ? null : v);

export async function getState(db: D1Like) {
  const [leads, inter, tpl] = await Promise.all([
    db.prepare("SELECT * FROM leads ORDER BY created_at DESC").all<Lead>(),
    db.prepare("SELECT * FROM interactions ORDER BY created_at DESC").all<Interaction>(),
    db.prepare("SELECT chave, texto FROM message_templates").all<{ chave: keyof Templates; texto: string }>(),
  ]);
  const templates: Templates = { ...DEFAULT_TEMPLATES };
  for (const t of tpl.results) templates[t.chave] = t.texto;
  return { leads: leads.results, interactions: inter.results, templates };
}

export async function getLead(db: D1Like, id: string): Promise<Lead | null> {
  return db.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first<Lead>();
}

export async function createLead(db: D1Like, input: Record<string, unknown> & { id: string; nome: string; cidade: string }): Promise<Lead> {
  const t = now();
  const key = dedupeKey(input.nome, input.cidade);
  // Possível duplicado: mesma chave fraca. Apenas sinaliza; o cadastro manual é permitido.
  const weak = await db.prepare("SELECT id FROM leads WHERE dedupe_key = ? LIMIT 1").bind(key).first<{ id: string }>();
  const row: Record<string, unknown> = {
    ...EMPTY_LEAD, ...input, origem: "manual", import_batch_id: null,
    dedupe_key: key, possivel_duplicado_de: weak?.id ?? null, created_at: t, updated_at: t,
  };
  const binds = INSERT_COLS.map((c) => row[c] ?? null);
  try {
    await db.prepare(`INSERT INTO leads (${COLS_SQL}) VALUES (${PLACEHOLDERS})`).bind(...binds).run();
  } catch (e) {
    if (isUnique(e)) throw new RepoError(409, "duplicado");
    throw e;
  }
  return (await getLead(db, input.id))!;
}

export async function updateLead(db: D1Like, id: string, patch: Record<string, unknown>): Promise<Lead> {
  const cur = await getLead(db, id);
  if (!cur) throw new RepoError(404, "nao_encontrado");
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const k of LEAD_FIELDS) {
    if (patch[k] === undefined) continue; // nomes de coluna vêm só da whitelist LEAD_FIELDS
    sets.push(`${k} = ?`);
    binds.push(patch[k]);
  }
  if (patch.nome !== undefined || patch.cidade !== undefined) {
    sets.push("dedupe_key = ?");
    binds.push(dedupeKey((patch.nome as string) ?? cur.nome, (patch.cidade as string) ?? cur.cidade));
  }
  sets.push("updated_at = ?");
  binds.push(now());
  const stmts = [db.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id)];
  if (patch.status !== undefined && patch.status !== cur.status) {
    stmts.push(statusLog(db, id, cur.status, patch.status as Status));
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    if (isUnique(e)) throw new RepoError(409, "duplicado");
    throw e;
  }
  return (await getLead(db, id))!;
}

const statusLog = (db: D1Like, leadId: string, from: Status, to: Status) =>
  db
    .prepare("INSERT INTO interactions (id, lead_id, tipo, observacao, created_at) VALUES (?, ?, 'status_alterado', ?, ?)")
    .bind(crypto.randomUUID(), leadId, `${from} → ${to}`, now());

export async function deleteLead(db: D1Like, id: string): Promise<void> {
  const r = await db.prepare("DELETE FROM leads WHERE id = ?").bind(id).run();
  if (r.meta?.changes === 0) throw new RepoError(404, "nao_encontrado");
}

export async function addInteraction(db: D1Like, i: Omit<Interaction, "created_at">): Promise<Interaction> {
  if (!(await getLead(db, i.lead_id))) throw new RepoError(404, "lead_nao_encontrado");
  const t = now();
  try {
    await db
      .prepare("INSERT INTO interactions (id, lead_id, tipo, canal, resposta, observacao, proxima_acao, acompanhar_em, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(i.id, i.lead_id, i.tipo, i.canal, i.resposta, i.observacao, i.proxima_acao, i.acompanhar_em, t)
      .run();
  } catch (e) {
    if (isUnique(e)) throw new RepoError(409, "duplicado");
    throw e;
  }
  return { ...i, created_at: t };
}

export async function setTemplates(db: D1Like, t: Templates): Promise<Templates> {
  const at = now();
  await db.batch(
    (["com_decisor", "sem_decisor"] as const).map((k) =>
      db
        .prepare("INSERT INTO message_templates (chave, texto, updated_at) VALUES (?, ?, ?) ON CONFLICT (chave) DO UPDATE SET texto = excluded.texto, updated_at = excluded.updated_at")
        .bind(k, t[k], at),
    ),
  );
  return t;
}

// ---------- importação ----------
// Colunas que a importação pode completar em leads existentes (só se estiverem vazias no banco).
const FILL_TEXT = [
  "segmento", "bairro", "endereco", "google_maps_url", "google_place_id", "site", "instagram", "cnpj", "decisor_nome",
  "decisor_cargo", "decisor_confianca", "decisor_canal_url", "telefone", "whatsapp", "oportunidade",
  "prioridade_justificativa", "fonte", "pesquisado_em", "observacoes",
] as const;
const FILL_NUM = ["nota_google", "qtd_avaliacoes"] as const;

export type ImportInput = { arquivo: string; kind: "csv" | "xlsx"; table: unknown[][]; mapping: Mapping; criarNovos: number[] };

export async function importLeads(db: D1Like, input: ImportInput): Promise<ImportReport & { batch: string }> {
  const existing = (await db.prepare("SELECT * FROM leads").all<Lead>()).results;
  const rows = parseRows(input.table, input.mapping, existing); // revalida tudo no servidor
  const t = now();
  const batchId = crypto.randomUUID();
  const { leads, report } = applyImport(rows, existing, input.kind, new Set(input.criarNovos), () => crypto.randomUUID(), t);

  const have = new Set(existing.map((l) => l.id));
  const novos = leads.filter((l) => !have.has(l.id)).map((l) => ({ ...l, import_batch_id: batchId, dedupe_key: dedupeKey(l.nome, l.cidade), possivel_duplicado_de: nul(l.possivel_duplicado_de) }));
  const fills = leads.filter((l) => have.has(l.id) && l.updated_at === t).map((l) => ({ id: l.id, ...Object.fromEntries([...FILL_TEXT, ...FILL_NUM].map((k) => [k, (l as unknown as Record<string, unknown>)[k]])) }));

  const stmts = [
    db.prepare("INSERT INTO import_batches (id, arquivo, origem, relatorio, created_at) VALUES (?, ?, ?, ?, ?)").bind(batchId, input.arquivo.slice(0, 300), input.kind, JSON.stringify(report), t),
  ];
  if (novos.length) {
    // Um único parâmetro JSON (D1 limita a 100 parâmetros por consulta e 50 consultas por invocação).
    const sel = INSERT_COLS.map((c) => `json_extract(value, '$.${c}')`).join(", ");
    stmts.push(db.prepare(`INSERT INTO leads (${COLS_SQL}) SELECT ${sel} FROM json_each(?)`).bind(JSON.stringify(novos)));
  }
  if (fills.length) {
    // Completa só o que está vazio NO BANCO no momento da gravação (nunca sobrescreve edição manual).
    const sets = [
      ...FILL_TEXT.map((k) => `${k} = CASE WHEN leads.${k} = '' THEN COALESCE(json_extract(j.value, '$.${k}'), '') ELSE leads.${k} END`),
      ...FILL_NUM.map((k) => `${k} = COALESCE(leads.${k}, json_extract(j.value, '$.${k}'))`),
      "updated_at = ?2",
    ];
    stmts.push(db.prepare(`UPDATE leads SET ${sets.join(", ")} FROM json_each(?1) AS j WHERE leads.id = json_extract(j.value, '$.id')`).bind(JSON.stringify(fills), t));
  }
  try {
    await db.batch(stmts); // transação única: tudo ou nada
  } catch (e) {
    if (isUnique(e)) throw new RepoError(409, "conflito_de_duplicidade");
    throw e;
  }
  return { ...report, batch: batchId };
}
