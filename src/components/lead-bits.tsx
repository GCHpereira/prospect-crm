"use client";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { STATUSES, statusInfo, type Lead, type Status } from "@/lib/types";
import { pickNumber, waLink } from "@/lib/whatsapp";

export function StatusBadge({ status }: { status: Status }) {
  const s = statusInfo(status);
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

export function StatusSelect({ lead, className = "" }: { lead: Lead; className?: string }) {
  const { setStatus } = useStore();
  return (
    <select
      aria-label="Status"
      className={`field !py-2 text-sm ${className}`}
      value={lead.status}
      onChange={(e) => setStatus(lead.id, e.target.value as Status)}
    >
      {STATUSES.map((s) => (
        <option key={s.key} value={s.key}>{s.label}</option>
      ))}
    </select>
  );
}

/** Abre o WhatsApp (wa.me) com mensagem pronta. Abrir NÃO é enviar: pergunta depois. */
export function WhatsAppButton({ lead, className = "" }: { lead: Lead; className?: string }) {
  const { templates, addInteraction, setStatus } = useStore();
  const [asking, setAsking] = useState(false);
  const href = waLink(lead, templates);

  if (!href)
    return (
      <button disabled title="Sem número válido" className={`btn btn-ghost ${className}`}>
        Sem número válido
      </button>
    );

  const opened = () => {
    addInteraction({ lead_id: lead.id, tipo: "whatsapp_aberto", canal: "WhatsApp", resposta: "", observacao: `+${pickNumber(lead)}`, proxima_acao: "", acompanhar_em: "" });
    setAsking(true);
  };
  const sent = () => {
    addInteraction({ lead_id: lead.id, tipo: "mensagem_enviada", canal: "WhatsApp", resposta: "", observacao: "", proxima_acao: "", acompanhar_em: "" });
    if (lead.status === "novo") setStatus(lead.id, "aguardando_resposta");
    setAsking(false);
  };

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={opened}
        className={`btn bg-emerald-600 text-white hover:bg-emerald-700 ${className}`}
      >
        Abrir no WhatsApp
      </a>
      {asking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center" role="dialog" aria-modal="true">
          <div className="card w-full max-w-sm space-y-3 p-5">
            <p className="font-medium">Você enviou a mensagem para {lead.nome}?</p>
            <p className="text-sm text-zinc-500">Abrir a conversa não significa que foi enviada.</p>
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1" onClick={sent}>Enviei</button>
              <button className="btn btn-ghost flex-1" onClick={() => setAsking(false)}>Não enviei</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Stars({ nota, qtd }: { nota: number | null; qtd: number | null }) {
  if (nota == null) return <span className="text-zinc-400">sem nota</span>;
  return (
    <span className="text-sm text-zinc-600">
      <span className="text-amber-500">★</span> {nota.toFixed(1)}
      {qtd != null && <span className="text-zinc-400"> ({qtd})</span>}
    </span>
  );
}

export function PriorityPill({ value }: { value: number }) {
  const c = value >= 75 ? "bg-emerald-100 text-emerald-800" : value >= 50 ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600";
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${c}`}>P{value}</span>;
}

export function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/leads/${lead.id}`} className="min-w-0">
          <h3 className="truncate font-semibold">{lead.nome}</h3>
          <p className="truncate text-sm text-zinc-500">
            {[lead.segmento, lead.bairro, lead.cidade].filter(Boolean).join(" · ")}
          </p>
        </Link>
        <PriorityPill value={lead.prioridade} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars nota={lead.nota_google} qtd={lead.qtd_avaliacoes} />
        <StatusBadge status={lead.status} />
        {!lead.site && <span className="text-xs font-medium text-rose-600">sem site</span>}
        {lead.possivel_duplicado_de && <span className="text-xs font-medium text-amber-700">possível duplicado</span>}
      </div>
      {lead.oportunidade && <p className="line-clamp-2 text-sm text-zinc-600">{lead.oportunidade}</p>}
      <p className="text-sm text-zinc-500">
        {lead.decisor_nome ? `Decisor: ${lead.decisor_nome}` : "Decisor não identificado"}
      </p>
      <div className="flex gap-2">
        <WhatsAppButton lead={lead} className="flex-1 !py-3" />
        <Link href={`/leads/${lead.id}`} className="btn btn-ghost">Detalhes</Link>
      </div>
    </div>
  );
}
