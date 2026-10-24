"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ImportReport, Mapping } from "./import";
import { DEFAULT_TEMPLATES, EMPTY_LEAD, type Interaction, type Lead, type Status, type Templates } from "./types";

// Estado vem do servidor (Cloudflare D1, via /api). Atualizações são otimistas: a tela muda na hora,
// a gravação vai para o servidor e, se falhar, o estado é recarregado e um aviso aparece.
type State = { leads: Lead[]; interactions: Interaction[]; templates: Templates };

export type ImportInput = { arquivo: string; kind: "csv" | "xlsx"; table: unknown[][]; mapping: Mapping; criarNovos: number[] };

export type Notice = { kind: "success" | "error"; text: string };

export type Store = State & {
  ready: boolean;
  error: "" | "unauthorized" | "network" | "save";
  notice: Notice | null;
  dismissNotice: () => void;
  clearError: () => void;
  addLead: (p: Partial<Lead>) => string;
  updateLead: (id: string, p: Partial<Lead>) => void;
  setStatus: (id: string, s: Status) => void;
  /** Exclui no servidor e só então remove da tela. Devolve true se o lead foi realmente excluído. */
  deleteLead: (id: string) => Promise<boolean>;
  addInteraction: (i: Omit<Interaction, "id" | "created_at">) => void;
  setTemplates: (t: Templates) => void;
  importLeads: (i: ImportInput) => Promise<ImportReport>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("StoreProvider ausente");
  return c;
};

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// Campos que o servidor aceita no cadastro/edição (o resto é controlado pelo servidor).
const WRITABLE = [
  "nome", "cidade", "segmento", "bairro", "endereco", "google_maps_url", "google_place_id", "nota_google", "qtd_avaliacoes",
  "site", "instagram", "cnpj", "decisor_nome", "decisor_cargo", "decisor_confianca", "decisor_canal_url", "telefone", "whatsapp",
  "numero_preferido", "oportunidade", "prioridade", "prioridade_justificativa", "fonte", "pesquisado_em", "verificado_em",
  "observacoes", "status",
] as const;
const pick = (p: Partial<Lead>) => Object.fromEntries(WRITABLE.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));

async function call(method: string, url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>({ leads: [], interactions: [], templates: DEFAULT_TEMPLATES });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Store["error"]>("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await call("GET", "/api/state");
      if (r.status === 401 || r.status === 403) return setError("unauthorized");
      if (!r.ok) return setError("network");
      setS(await r.json());
      // não apaga o aviso de falha de gravação: ele precisa continuar visível até ser dispensado
      setError((e) => (e === "save" ? e : ""));
    } catch {
      setError("network");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const store = useMemo<Store>(() => {
    const save = (method: string, url: string, body?: unknown) =>
      call(method, url, body)
        .then((r) => {
          if (r.status === 401 || r.status === 403) setError("unauthorized");
          else if (!r.ok) {
            setError("save");
            return refresh();
          }
        })
        .catch(() => {
          setError("save");
          return refresh();
        });
    const log = (p: State, lead_id: string, tipo: Interaction["tipo"], extra: Partial<Interaction> = {}): State => ({
      ...p,
      interactions: [{ id: uid(), lead_id, tipo, canal: "", resposta: "", observacao: "", proxima_acao: "", acompanhar_em: "", created_at: nowIso(), ...extra }, ...p.interactions],
    });
    return {
      ...s,
      ready,
      error,
      notice,
      dismissNotice: () => setNotice(null),
      clearError: () => setError(""),
      refresh,
      addLead: (p) => {
        const id = uid();
        const t = nowIso();
        const lead: Lead = { ...EMPTY_LEAD, ...p, id, origem: "manual", possivel_duplicado_de: "", created_at: t, updated_at: t };
        setS((x) => ({ ...x, leads: [lead, ...x.leads] }));
        void save("POST", "/api/leads", { id, ...pick(lead) });
        return id;
      },
      updateLead: (id, p) => {
        setS((x) => ({ ...x, leads: x.leads.map((l) => (l.id === id ? { ...l, ...p, id, updated_at: nowIso() } : l)) }));
        void save("PATCH", `/api/leads/${id}`, pick(p));
      },
      setStatus: (id, st) => {
        setS((x) => {
          const cur = x.leads.find((l) => l.id === id);
          if (!cur || cur.status === st) return x;
          const next = { ...x, leads: x.leads.map((l) => (l.id === id ? { ...l, status: st, updated_at: nowIso() } : l)) };
          return log(next, id, "status_alterado", { observacao: `${cur.status} → ${st}` });
        });
        void save("PATCH", `/api/leads/${id}`, { status: st }); // o servidor registra a mudança no histórico
      },
      deleteLead: async (id) => {
        const fail = (text: string) => {
          setNotice({ kind: "error", text });
          return false;
        };
        try {
          const r = await call("DELETE", `/api/leads/${id}`);
          if (r.status === 401 || r.status === 403) {
            setError("unauthorized");
            return fail("Não foi possível excluir: sua sessão não está autorizada. Entre novamente pelo Cloudflare Access.");
          }
          if (r.status === 404) {
            await refresh();
            return fail("Este lead não foi encontrado (talvez já tenha sido excluído). A lista foi atualizada.");
          }
          if (!r.ok) return fail("Não foi possível excluir o lead. Nada foi apagado; tente novamente.");
          // servidor confirmou: agora sim remove da tela
          setS((x) => ({ ...x, leads: x.leads.filter((l) => l.id !== id), interactions: x.interactions.filter((i) => i.lead_id !== id) }));
          setNotice({ kind: "success", text: "Lead excluído com sucesso." });
          return true;
        } catch {
          return fail("Sem conexão com o servidor. O lead não foi excluído.");
        }
      },
      addInteraction: (i) => {
        const id = uid();
        setS((x) => log(x, i.lead_id, i.tipo, { ...i, id }));
        void save("POST", "/api/interactions", { id, ...i });
      },
      setTemplates: (templates) => {
        setS((x) => ({ ...x, templates }));
        void save("PUT", "/api/templates", templates);
      },
      importLeads: async (input) => {
        const r = await call("POST", "/api/import", input);
        if (r.status === 401 || r.status === 403) setError("unauthorized");
        if (!r.ok) throw new Error(`import_${r.status}`);
        const report = (await r.json()) as ImportReport;
        await refresh();
        return report;
      },
    };
  }, [s, ready, error, notice, refresh]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
