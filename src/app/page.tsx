"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { LeadCard } from "@/components/lead-bits";
import type { Status } from "@/lib/types";

export default function Dashboard() {
  const { leads, interactions, ready } = useStore();
  if (!ready) return <p className="text-zinc-500">Carregando…</p>;

  const count = (...s: Status[]) => leads.filter((l) => s.includes(l.status)).length;
  const kpis = [
    { label: "Total de leads", v: leads.length },
    { label: "Novos", v: count("novo") },
    { label: "Contatados", v: count("contato_iniciado", "aguardando_resposta") },
    { label: "Responderam", v: count("respondeu") },
    { label: "Reuniões", v: count("reuniao_marcada") },
    { label: "Propostas", v: count("proposta_enviada", "negociacao") },
    { label: "Fechados", v: count("fechado") },
    { label: "Sem interesse", v: count("sem_interesse") },
  ];
  const today = new Date().toISOString().slice(0, 10);
  const due = interactions.filter((i) => i.acompanhar_em && i.acompanhar_em <= today);
  const dueLeads = [...new Set(due.map((i) => i.lead_id))].map((id) => leads.find((l) => l.id === id)).filter(Boolean);
  const next = leads.filter((l) => l.status === "novo").sort((a, b) => b.prioridade - a.prioridade).slice(0, 4);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Painel</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card p-3">
            <div className="text-2xl font-semibold">{k.v}</div>
            <div className="text-xs text-zinc-500">{k.label}</div>
          </div>
        ))}
      </div>

      {dueLeads.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Acompanhamentos pendentes</h2>
          <ul className="card divide-y divide-zinc-100">
            {dueLeads.map((l) => (
              <li key={l!.id}>
                <Link href={`/leads/${l!.id}`} className="flex justify-between p-3 text-sm">
                  <span>{l!.nome}</span>
                  <span className="text-zinc-400">ver</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Próximos para contatar</h2>
          <Link href="/leads?status=novo" className="text-sm text-emerald-700 underline">ver todos</Link>
        </div>
        {next.length === 0 ? (
          <p className="card p-4 text-sm text-zinc-500">
            Nenhum lead novo. <Link href="/importar" className="underline">Importe uma planilha</Link> ou <Link href="/leads/novo" className="underline">cadastre um lead</Link>.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">{next.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
        )}
      </section>
    </div>
  );
}
