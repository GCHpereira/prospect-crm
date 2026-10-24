"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { norm } from "@/lib/dedupe";
import { LeadCard, PriorityPill, Stars, StatusSelect, WhatsAppButton } from "@/components/lead-bits";
import { STATUSES } from "@/lib/types";

type Sort = "prioridade" | "avaliacao" | "recentes";

function LeadsList() {
  const { leads, ready } = useStore();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [segmento, setSegmento] = useState("");
  const [cidade, setCidade] = useState("");
  const [minPrio, setMinPrio] = useState(0);
  const [sort, setSort] = useState<Sort>("prioridade");
  const [view, setView] = useState<"cards" | "tabela">("cards");

  const segmentos = useMemo(() => [...new Set(leads.map((l) => l.segmento).filter(Boolean))].sort(), [leads]);
  const cidades = useMemo(() => [...new Set(leads.map((l) => l.cidade).filter(Boolean))].sort(), [leads]);

  const rows = useMemo(() => {
    const nq = norm(q);
    return leads
      .filter((l) => (!nq || norm(l.nome).includes(nq)) && (!status || l.status === status) && (!segmento || l.segmento === segmento) && (!cidade || l.cidade === cidade) && l.prioridade >= minPrio)
      .sort((a, b) =>
        sort === "prioridade" ? b.prioridade - a.prioridade : sort === "avaliacao" ? (b.nota_google ?? 0) - (a.nota_google ?? 0) || (b.qtd_avaliacoes ?? 0) - (a.qtd_avaliacoes ?? 0) : b.created_at.localeCompare(a.created_at),
      );
  }, [leads, q, status, segmento, cidade, minPrio, sort]);

  if (!ready) return <p className="text-zinc-500">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads <span className="text-base font-normal text-zinc-400">({rows.length})</span></h1>
        <Link href="/leads/novo" className="btn btn-primary">+ Novo</Link>
      </div>

      <input className="field" type="search" placeholder="Buscar empresa pelo nome…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <select className="field" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className="field" value={segmento} onChange={(e) => setSegmento(e.target.value)} aria-label="Nicho">
          <option value="">Todos os nichos</option>
          {segmentos.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="field" value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade">
          <option value="">Todas as cidades</option>
          {cidades.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="field" value={minPrio} onChange={(e) => setMinPrio(Number(e.target.value))} aria-label="Pontuação mínima">
          <option value={0}>Qualquer pontuação</option>
          <option value={50}>Pontuação ≥ 50</option>
          <option value={75}>Pontuação ≥ 75</option>
          <option value={90}>Pontuação ≥ 90</option>
        </select>
        <select className="field col-span-2 md:col-span-1" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
          <option value="prioridade">Ordenar: prioridade</option>
          <option value="avaliacao">Ordenar: avaliação</option>
          <option value="recentes">Ordenar: mais recentes</option>
        </select>
      </div>

      <div className="hidden justify-end gap-1 md:flex">
        {(["cards", "tabela"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`btn ${view === v ? "btn-primary" : "btn-ghost"} !py-1.5`}>{v === "cards" ? "Cards" : "Tabela"}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-zinc-500">Nenhum lead encontrado.</p>
      ) : (
        <>
          <div className={`grid gap-3 md:grid-cols-2 ${view === "tabela" ? "md:hidden" : ""}`}>
            {rows.map((l) => <LeadCard key={l.id} lead={l} />)}
          </div>
          {view === "tabela" && (
            <div className="card hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                  <tr>
                    {["Empresa", "Nicho", "Cidade", "Avaliação", "Prior.", "Status", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map((l) => (
                    <tr key={l.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-2"><Link href={`/leads/${l.id}`} className="font-medium hover:underline">{l.nome}</Link></td>
                      <td className="px-3 py-2 text-zinc-600">{l.segmento}</td>
                      <td className="px-3 py-2 text-zinc-600">{l.cidade}</td>
                      <td className="px-3 py-2"><Stars nota={l.nota_google} qtd={l.qtd_avaliacoes} /></td>
                      <td className="px-3 py-2"><PriorityPill value={l.prioridade} /></td>
                      <td className="px-3 py-2"><StatusSelect lead={l} className="min-w-40" /></td>
                      <td className="px-3 py-2"><WhatsAppButton lead={l} className="!py-1.5" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-zinc-500">Carregando…</p>}>
      <LeadsList />
    </Suspense>
  );
}
