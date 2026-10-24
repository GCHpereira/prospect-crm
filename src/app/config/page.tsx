"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { buildMessage } from "@/lib/whatsapp";
import { DEFAULT_TEMPLATES } from "@/lib/types";

export default function Config() {
  const { templates, setTemplates, ready } = useStore();
  const [t, setT] = useState<typeof templates | null>(null);
  if (!ready) return <p className="text-zinc-500">Carregando…</p>;
  const cur = t ?? templates;
  const preview = (tpl: string, decisor: string) => buildMessage({ nome: "Empresa Exemplo", decisor_nome: decisor }, { com_decisor: tpl, sem_decisor: tpl });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <section className="card space-y-4 p-4">
        <h2 className="font-medium">Mensagens do WhatsApp</h2>
        <p className="text-sm text-zinc-500">Use {"{decisor}"} e {"{empresa}"}. A mensagem só é preenchida no WhatsApp; você envia manualmente.</p>
        {(cur.com_decisor.includes("[SEU NOME]") || cur.sem_decisor.includes("[SEU NOME]")) && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
            Troque <b>[SEU NOME]</b> pelo seu nome antes de usar os botões de WhatsApp.
          </p>
        )}
        {(["com_decisor", "sem_decisor"] as const).map((k) => (
          <label key={k} className="block space-y-1">
            <span className="text-sm font-medium">{k === "com_decisor" ? "Com decisor identificado" : "Sem decisor identificado"}</span>
            <textarea className="field min-h-24" maxLength={1000} value={cur[k]} onChange={(e) => setT({ ...cur, [k]: e.target.value })} />
            <span className="block text-xs text-zinc-500">Prévia: {preview(cur[k], k === "com_decisor" ? "Carlos" : "")}</span>
          </label>
        ))}
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={!t || !cur.com_decisor.trim() || !cur.sem_decisor.trim()} onClick={() => { setTemplates(cur); setT(null); }}>Salvar</button>
          <button className="btn btn-ghost" onClick={() => setT(DEFAULT_TEMPLATES)}>Restaurar padrão</button>
        </div>
      </section>

    </div>
  );
}
