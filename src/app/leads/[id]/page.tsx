"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { LeadForm } from "@/components/LeadForm";
import { PriorityPill, Stars, StatusSelect, WhatsAppButton } from "@/components/lead-bits";
import { useStore } from "@/lib/store";
import { TIPO_LABEL, type Lead } from "@/lib/types";

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const Row = ({ k, v }: { k: string; v?: React.ReactNode }) =>
  v ? (
    <div className="flex justify-between gap-4 border-b border-zinc-100 py-2 text-sm last:border-0">
      <dt className="shrink-0 text-zinc-500">{k}</dt>
      <dd className="min-w-0 break-words text-right">{v}</dd>
    </div>
  ) : null;

const link = (u: string) =>
  /^https?:\/\//i.test(u) ? <a href={u} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">{u.replace(/^https?:\/\//, "").slice(0, 40)}</a> : u;

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const { leads, interactions, updateLead, deleteLead, addInteraction, ready } = useStore();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [obs, setObs] = useState<string | null>(null);
  const [h, setH] = useState({ tipo: "nota" as "nota" | "ligacao" | "resposta", canal: "", resposta: "", observacao: "", proxima_acao: "", acompanhar_em: "" });

  const lead = leads.find((l) => l.id === id);
  if (!ready) return <p className="text-zinc-500">Carregando…</p>;
  if (!lead) return <p>Lead não encontrado. <Link href="/leads" className="underline">Voltar</Link></p>;

  const hist = interactions.filter((i) => i.lead_id === id);
  const original = lead.possivel_duplicado_de ? leads.find((l) => l.id === lead.possivel_duplicado_de) : null;

  if (editing)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Editar {lead.nome}</h1>
        <LeadForm initial={lead} submitLabel="Salvar alterações" onSubmit={(f) => { updateLead(id, f as Partial<Lead>); setEditing(false); }} />
        <button className="btn btn-ghost w-full" onClick={() => setEditing(false)}>Cancelar</button>
      </div>
    );

  const addHist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!h.observacao.trim() && !h.resposta.trim() && !h.proxima_acao.trim()) return;
    addInteraction({ lead_id: id, ...h, canal: h.canal || (h.tipo === "ligacao" ? "Telefone" : "") });
    setH({ ...h, canal: "", resposta: "", observacao: "", proxima_acao: "", acompanhar_em: "" });
  };

  return (
    <div className="space-y-5">
      <Link href="/leads" className="text-sm text-zinc-500">← Leads</Link>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{lead.nome}</h1>
          <p className="text-sm text-zinc-500">{[lead.segmento, lead.bairro, lead.cidade].filter(Boolean).join(" · ")}</p>
          <div className="mt-1 flex items-center gap-2"><Stars nota={lead.nota_google} qtd={lead.qtd_avaliacoes} /><PriorityPill value={lead.prioridade} /></div>
        </div>
        <button className="btn btn-ghost" onClick={() => setEditing(true)}>Editar</button>
      </div>

      {original && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Possível duplicado de <Link className="underline" href={`/leads/${original.id}`}>{original.nome}</Link>.</p>}

      <div className="card space-y-3 p-4">
        <WhatsAppButton lead={lead} className="w-full !py-3.5 text-base" />
        <StatusSelect lead={lead} />
      </div>

      <section className="card p-4">
        <h2 className="mb-1 font-medium">Contato</h2>
        <dl>
          <Row k="Decisor" v={lead.decisor_nome && `${lead.decisor_nome}${lead.decisor_cargo ? ` (${lead.decisor_cargo})` : ""}`} />
          <Row k="Confiança" v={lead.decisor_confianca} />
          <Row k="Canal do decisor" v={lead.decisor_canal_url && link(lead.decisor_canal_url)} />
          <Row k="WhatsApp" v={lead.whatsapp} />
          <Row k="Telefone" v={lead.telefone} />
          <Row k="Usar" v={lead.numero_preferido === "telefone" ? "Telefone" : "WhatsApp"} />
        </dl>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 font-medium">Empresa e oportunidade</h2>
        <dl>
          <Row k="Endereço" v={lead.endereco} />
          <Row k="Google Maps" v={lead.google_maps_url && link(lead.google_maps_url)} />
          <Row k="Site" v={lead.site ? link(lead.site) : <span className="text-rose-600">sem site</span>} />
          <Row k="Instagram" v={lead.instagram} />
          <Row k="CNPJ" v={lead.cnpj} />
          <Row k="Oportunidade" v={lead.oportunidade} />
          <Row k="Justificativa" v={lead.prioridade_justificativa} />
          <Row k="Fonte" v={lead.fonte} />
          <Row k="Pesquisado em" v={lead.pesquisado_em} />
          <Row k="Verificado em" v={lead.verificado_em} />
          <Row k="Origem do cadastro" v={lead.origem} />
        </dl>
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-medium">Observações</h2>
        <textarea className="field min-h-24" maxLength={4000} value={obs ?? lead.observacoes} onChange={(e) => setObs(e.target.value)} />
        {obs !== null && obs !== lead.observacoes && (
          <button className="btn btn-primary" onClick={() => { updateLead(id, { observacoes: obs }); setObs(null); }}>Salvar observações</button>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-medium">Histórico</h2>
        <form onSubmit={addHist} className="space-y-2 rounded-lg bg-zinc-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="field" value={h.tipo} onChange={(e) => setH({ ...h, tipo: e.target.value as typeof h.tipo })}>
              <option value="nota">Nota</option>
              <option value="ligacao">Ligação</option>
              <option value="resposta">Resposta recebida</option>
            </select>
            <input className="field" placeholder="Canal (WhatsApp, telefone…)" value={h.canal} onChange={(e) => setH({ ...h, canal: e.target.value })} maxLength={50} />
          </div>
          {h.tipo === "resposta" && <input className="field" placeholder="Resposta recebida" value={h.resposta} onChange={(e) => setH({ ...h, resposta: e.target.value })} maxLength={1000} />}
          <input className="field" placeholder="Observação" value={h.observacao} onChange={(e) => setH({ ...h, observacao: e.target.value })} maxLength={1000} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="field" placeholder="Próxima ação" value={h.proxima_acao} onChange={(e) => setH({ ...h, proxima_acao: e.target.value })} maxLength={300} />
            <input className="field" type="date" aria-label="Acompanhar em" value={h.acompanhar_em} onChange={(e) => setH({ ...h, acompanhar_em: e.target.value })} />
          </div>
          <button className="btn btn-primary w-full" type="submit">Registrar</button>
        </form>
        {hist.length === 0 ? (
          <p className="text-sm text-zinc-500">Sem registros ainda.</p>
        ) : (
          <ul className="space-y-3">
            {hist.map((i) => (
              <li key={i.id} className="border-l-2 border-zinc-200 pl-3 text-sm">
                <div className="flex justify-between gap-2"><span className="font-medium">{TIPO_LABEL[i.tipo]}{i.canal && ` · ${i.canal}`}</span><span className="text-xs text-zinc-400">{fmt(i.created_at)}</span></div>
                {i.resposta && <p className="text-zinc-700">Resposta: {i.resposta}</p>}
                {i.observacao && <p className="text-zinc-600">{i.observacao}</p>}
                {(i.proxima_acao || i.acompanhar_em) && <p className="text-emerald-800">Próxima: {i.proxima_acao} {i.acompanhar_em && `(${i.acompanhar_em})`}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        className="text-sm text-rose-600 underline disabled:opacity-50"
        disabled={deleting}
        onClick={async () => {
          if (!confirm(`Excluir "${lead.nome}" e seu histórico?`)) return;
          setDeleting(true);
          const ok = await deleteLead(id); // espera o servidor confirmar
          if (ok) router.push("/leads");
          else setDeleting(false); // erro: permanece na tela; a mensagem aparece no topo
        }}
      >
        {deleting ? "Excluindo…" : "Excluir lead"}
      </button>
    </div>
  );
}
