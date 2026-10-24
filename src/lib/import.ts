import { z } from "zod";
import { dedupeKey, norm, onlyDigits, validCnpj } from "./dedupe";
import { EMPTY_LEAD, type Lead } from "./types";
import { normalizePhone } from "./whatsapp";

export const MAX_ROWS = 500;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

type FieldKey =
  | "nome" | "segmento" | "cidade" | "bairro" | "endereco" | "google_maps_url" | "google_place_id"
  | "nota_google" | "qtd_avaliacoes" | "site" | "instagram" | "cnpj" | "decisor_nome" | "decisor_cargo"
  | "decisor_confianca" | "decisor_canal_url" | "telefone" | "whatsapp" | "numero_preferido"
  | "oportunidade" | "prioridade" | "prioridade_justificativa" | "fonte" | "pesquisado_em" | "observacoes";

export const IMPORT_FIELDS: { key: FieldKey; label: string; aliases: string[] }[] = [
  { key: "nome", label: "Empresa (obrigatório)", aliases: ["nome", "empresa", "nome da empresa", "razao social", "negocio"] },
  { key: "cidade", label: "Cidade (obrigatório)", aliases: ["cidade", "municipio"] },
  { key: "segmento", label: "Segmento", aliases: ["segmento", "nicho", "categoria", "ramo"] },
  { key: "bairro", label: "Bairro", aliases: ["bairro"] },
  { key: "endereco", label: "Endereço", aliases: ["endereco", "endereco comercial", "logradouro"] },
  { key: "google_maps_url", label: "URL Google Maps", aliases: ["google maps url", "url google maps", "maps", "link maps", "url maps"] },
  { key: "google_place_id", label: "ID Google Maps", aliases: ["google place id", "place id", "id google maps", "id maps", "cid"] },
  { key: "nota_google", label: "Nota Google", aliases: ["nota google", "nota", "rating", "avaliacao"] },
  { key: "qtd_avaliacoes", label: "Qtd. avaliações", aliases: ["qtd avaliacoes", "avaliacoes", "reviews", "numero de avaliacoes", "total avaliacoes"] },
  { key: "site", label: "Site", aliases: ["site", "website", "site atual"] },
  { key: "instagram", label: "Instagram", aliases: ["instagram", "insta"] },
  { key: "cnpj", label: "CNPJ", aliases: ["cnpj"] },
  { key: "decisor_nome", label: "Decisor (nome)", aliases: ["decisor nome", "decisor", "responsavel", "proprietario", "dono", "contato"] },
  { key: "decisor_cargo", label: "Decisor (cargo)", aliases: ["decisor cargo", "cargo", "funcao"] },
  { key: "decisor_confianca", label: "Confiança do decisor", aliases: ["decisor confianca", "confianca", "nivel de confianca"] },
  { key: "decisor_canal_url", label: "Canal do decisor", aliases: ["decisor canal url", "canal decisor", "linkedin", "canal profissional"] },
  { key: "telefone", label: "Telefone", aliases: ["telefone", "fone", "tel", "telefone comercial"] },
  { key: "whatsapp", label: "WhatsApp", aliases: ["whatsapp", "whats", "zap", "whatsapp comercial"] },
  { key: "numero_preferido", label: "Número preferido", aliases: ["numero preferido", "contato preferido"] },
  { key: "oportunidade", label: "Oportunidade", aliases: ["oportunidade", "oportunidade comercial"] },
  { key: "prioridade", label: "Prioridade (0-100)", aliases: ["prioridade", "pontuacao", "score"] },
  { key: "prioridade_justificativa", label: "Justificativa", aliases: ["prioridade justificativa", "justificativa", "justificativa pontuacao"] },
  { key: "fonte", label: "Fonte", aliases: ["fonte", "origem", "fonte da informacao"] },
  { key: "pesquisado_em", label: "Data da pesquisa", aliases: ["pesquisado em", "data pesquisa", "data da pesquisa"] },
  { key: "observacoes", label: "Observações", aliases: ["observacoes", "obs", "notas", "observacao"] },
];

/** Colunas do modelo padrão (public/modelo-leads.csv). */
export const TEMPLATE_COLUMNS = IMPORT_FIELDS.map((f) => f.key);

export type Mapping = Partial<Record<FieldKey, number>>;

export function autoMap(headers: string[]): Mapping {
  const m: Mapping = {};
  const nh = headers.map(norm);
  for (const f of IMPORT_FIELDS) {
    const hit = nh.findIndex((h) => h === norm(f.key) || f.aliases.includes(h));
    if (hit >= 0) m[f.key] = hit;
  }
  return m;
}

const clean = (v: unknown, max = 2000): string => {
  if (v == null) return "";
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
  return /^[=@]|^[+-][^\d\s(]/.test(s) ? "'" + s : s; // neutraliza fórmulas
};

const num = (s: string): number | null => {
  if (!s) return null;
  // "4,8" -> 4.8 ; "1.234,5" -> 1234.5 ; "1.234" (sem vírgula) fica como 1.234
  const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

function isoDate(s: string): string {
  if (!s) return "";
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = br ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso)) ? iso : "";
}

const conf = (s: string) => {
  const n = norm(s);
  return n === "alta" || n === "media" || n === "baixa" ? n : "";
};

const url = (s: string) => (!s || /^https?:\/\//i.test(s) ? s : s.startsWith("'") ? "" : "https://" + s);

const rowSchema = z.object({
  nome: z.string().min(2, "Empresa obrigatória"),
  cidade: z.string().min(2, "Cidade obrigatória"),
  nota_google: z.number().min(0, "Nota deve ser 0–5").max(5, "Nota deve ser 0–5").nullable(),
  qtd_avaliacoes: z.number().int().min(0, "Avaliações inválidas").nullable(),
  prioridade: z.number().int().min(0, "Prioridade deve ser 0–100").max(100, "Prioridade deve ser 0–100"),
  cnpj: z.string().refine((c) => !c || validCnpj(c), "CNPJ inválido"),
  hasPhone: z.literal(true, { error: "Precisa de telefone ou WhatsApp válido" }),
});

export type ParsedRow = {
  line: number;
  state: "nova" | "atualiza" | "possivel_duplicado" | "duplicada_no_arquivo" | "invalida";
  errors: string[];
  data?: Omit<Lead, "id" | "created_at" | "updated_at" | "status" | "origem" | "possivel_duplicado_de" | "verificado_em">;
  matchId?: string;
};

export function parseRows(table: unknown[][], mapping: Mapping, existing: Lead[]): ParsedRow[] {
  const rows = table.slice(1, MAX_ROWS + 1);
  const byPlace = new Map(existing.filter((l) => l.google_place_id).map((l) => [l.google_place_id, l.id]));
  const byCnpj = new Map(existing.filter((l) => l.cnpj).map((l) => [onlyDigits(l.cnpj), l.id]));
  const byKey = new Map(existing.map((l) => [dedupeKey(l.nome, l.cidade), l.id]));
  const seen = new Set<string>();
  const out: ParsedRow[] = [];

  rows.forEach((r, i) => {
    const g = (k: FieldKey, max?: number) => (mapping[k] === undefined ? "" : clean(r[mapping[k]!], max));
    if (r.every((c) => c == null || String(c).trim() === "")) return;
    const nota = num(g("nota_google"));
    const aval = num(g("qtd_avaliacoes"));
    const prio = num(g("prioridade"));
    const tel = g("telefone", 40);
    const wpp = g("whatsapp", 40);
    const cnpj = g("cnpj", 30);
    const pref = norm(g("numero_preferido")) === "telefone" ? "telefone" : "whatsapp";

    const parsed = rowSchema.safeParse({
      nome: g("nome", 200),
      cidade: g("cidade", 100),
      nota_google: nota !== null && Number.isNaN(nota) ? 99 : nota,
      qtd_avaliacoes: aval === null ? null : Number.isNaN(aval) ? -1 : Math.round(aval),
      prioridade: prio === null ? 50 : Number.isNaN(prio) ? -1 : Math.round(prio),
      cnpj,
      hasPhone: !!(normalizePhone(tel) || normalizePhone(wpp)),
    });
    const line = i + 2;
    if (!parsed.success) {
      out.push({ line, state: "invalida", errors: [...new Set(parsed.error.issues.map((x) => x.message))] });
      return;
    }
    const d = parsed.data;
    const data: NonNullable<ParsedRow["data"]> = {
      ...EMPTY_LEAD,
      nome: d.nome,
      cidade: d.cidade,
      segmento: g("segmento", 100),
      bairro: g("bairro", 100),
      endereco: g("endereco", 300),
      google_maps_url: url(g("google_maps_url", 500)),
      google_place_id: g("google_place_id", 200),
      nota_google: d.nota_google,
      qtd_avaliacoes: d.qtd_avaliacoes,
      site: url(g("site", 300)),
      instagram: g("instagram", 200),
      cnpj: d.cnpj ? onlyDigits(d.cnpj) : "",
      decisor_nome: g("decisor_nome", 120),
      decisor_cargo: g("decisor_cargo", 120),
      decisor_confianca: conf(g("decisor_confianca")) as Lead["decisor_confianca"],
      decisor_canal_url: url(g("decisor_canal_url", 300)),
      telefone: tel,
      whatsapp: wpp,
      numero_preferido: pref,
      oportunidade: g("oportunidade", 500),
      prioridade: d.prioridade,
      prioridade_justificativa: g("prioridade_justificativa", 1000),
      fonte: g("fonte", 300),
      pesquisado_em: isoDate(g("pesquisado_em", 30)),
      observacoes: g("observacoes", 4000),
    };

    const ids = [data.google_place_id && "p:" + data.google_place_id, data.cnpj && "c:" + data.cnpj].filter(Boolean) as string[];
    const key = "k:" + dedupeKey(data.nome, data.cidade);
    if (ids.some((x) => seen.has(x)) || seen.has(key)) {
      out.push({ line, state: "duplicada_no_arquivo", errors: [], data });
      return;
    }
    [...ids, key].forEach((x) => seen.add(x));

    const strong = (data.google_place_id && byPlace.get(data.google_place_id)) || (data.cnpj && byCnpj.get(data.cnpj));
    if (strong) {
      out.push({ line, state: "atualiza", errors: [], data, matchId: strong });
      return;
    }
    const weak = byKey.get(dedupeKey(data.nome, data.cidade));
    if (weak) {
      out.push({ line, state: "possivel_duplicado", errors: [], data, matchId: weak });
      return;
    }
    out.push({ line, state: "nova", errors: [], data });
  });
  return out;
}

export type ImportReport = {
  total: number;
  novos: number;
  atualizados: number;
  duplicados: number;
  invalidos: number;
  sinalizados: number;
};

/**
 * Aplica o lote. Existentes: só preenche campos vazios (nunca sobrescreve edição manual,
 * status nem observações). Possível duplicado: só importa se a linha estiver em `criarNovos`
 * e sinaliza o original.
 */
export function applyImport(
  rows: ParsedRow[],
  existing: Lead[],
  origem: "csv" | "xlsx",
  criarNovos: Set<number>,
  newId: () => string,
  now: string,
): { leads: Lead[]; report: ImportReport } {
  const leads = existing.map((l) => ({ ...l }));
  const byId = new Map(leads.map((l) => [l.id, l]));
  const rep: ImportReport = { total: rows.length, novos: 0, atualizados: 0, duplicados: 0, invalidos: 0, sinalizados: 0 };
  const created: Lead[] = [];
  const mk = (data: NonNullable<ParsedRow["data"]>, dup = ""): Lead => ({
    ...data,
    id: newId(),
    status: "novo",
    origem,
    verificado_em: "",
    possivel_duplicado_de: dup,
    created_at: now,
    updated_at: now,
  });

  for (const r of rows) {
    if (r.state === "invalida") rep.invalidos++;
    else if (r.state === "duplicada_no_arquivo") rep.duplicados++;
    else if (r.state === "nova") {
      created.push(mk(r.data!));
      rep.novos++;
    } else if (r.state === "atualiza") {
      const t = byId.get(r.matchId!)!;
      const rec = t as unknown as Record<string, unknown>;
      let changed = false;
      for (const [k, v] of Object.entries(r.data!)) {
        const cur = rec[k];
        const empty = cur === "" || cur === null || cur === undefined;
        const has = v !== "" && v !== null && v !== undefined;
        if (empty && has && k !== "prioridade") {
          rec[k] = v;
          changed = true;
        }
      }
      if (changed) t.updated_at = now;
      rep.atualizados++;
    } else if (criarNovos.has(r.line)) {
      created.push(mk(r.data!, r.matchId));
      rep.novos++;
      rep.sinalizados++;
    } else rep.duplicados++;
  }
  return { leads: [...created, ...leads], report: rep };
}
