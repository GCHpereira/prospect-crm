"use client";
import { useState } from "react";
import { z } from "zod";
import { onlyDigits, validCnpj } from "@/lib/dedupe";
import { EMPTY_LEAD, type Lead } from "@/lib/types";
import { normalizePhone } from "@/lib/whatsapp";

type Form = Omit<Lead, "id" | "created_at" | "updated_at">;

const httpUrl = z.string().refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "URL deve começar com http:// ou https://");
const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da empresa"),
  cidade: z.string().trim().min(2, "Informe a cidade"),
  nota_google: z.number().min(0).max(5, "Nota de 0 a 5").nullable(),
  qtd_avaliacoes: z.number().int().min(0).nullable(),
  prioridade: z.number().int().min(0).max(100, "Prioridade de 0 a 100"),
  cnpj: z.string().refine((c) => !c || validCnpj(c), "CNPJ inválido"),
  telefone: z.string().refine((v) => !v || normalizePhone(v), "Telefone inválido (use DDD)"),
  whatsapp: z.string().refine((v) => !v || normalizePhone(v), "WhatsApp inválido (use DDD)"),
  google_maps_url: httpUrl,
  site: httpUrl,
  decisor_canal_url: httpUrl,
});

function Section({ t, children }: { t: string; children: React.ReactNode }): React.ReactElement {
  return (
  <fieldset className="card space-y-3 p-4">
    <legend className="px-1 text-sm font-semibold">{t}</legend>
    {children}
  </fieldset>
  );
}

export function LeadForm({ initial, onSubmit, submitLabel = "Salvar" }: { initial?: Partial<Lead>; onSubmit: (f: Form) => void; submitLabel?: string }) {
  const [f, setF] = useState<Form>({ ...EMPTY_LEAD, ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const text = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block space-y-1">
      <span className="text-sm text-zinc-600">{label}</span>
      <input className="field" value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} maxLength={500} {...props} />
      {errors[k] && <span className="text-xs text-rose-600">{errors[k]}</span>}
    </label>
  );
  const numField = (k: "nota_google" | "qtd_avaliacoes" | "prioridade", label: string, step = "1") => (
    <label className="block space-y-1">
      <span className="text-sm text-zinc-600">{label}</span>
      <input
        className="field" type="number" inputMode="decimal" step={step}
        value={f[k] ?? ""}
        onChange={(e) => set(k, (e.target.value === "" ? null : Number(e.target.value)) as never)}
      />
      {errors[k] && <span className="text-xs text-rose-600">{errors[k]}</span>}
    </label>
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = schema.safeParse({ ...f, prioridade: f.prioridade ?? 50 });
    if (!r.success) {
      const errs: Record<string, string> = {};
      for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    onSubmit({ ...f, nome: f.nome.trim(), cidade: f.cidade.trim(), cnpj: onlyDigits(f.cnpj), prioridade: f.prioridade ?? 50 });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Section t="Empresa">
        {text("nome", "Nome da empresa *")}
        <div className="grid gap-3 sm:grid-cols-2">
          {text("segmento", "Segmento / nicho")}
          {text("cidade", "Cidade *")}
          {text("bairro", "Bairro")}
          {text("endereco", "Endereço comercial")}
          {numField("nota_google", "Nota no Google", "0.1")}
          {numField("qtd_avaliacoes", "Qtd. de avaliações")}
          {text("site", "Site atual", { inputMode: "url", placeholder: "https://" })}
          {text("instagram", "Instagram")}
          {text("google_maps_url", "URL do Google Maps", { inputMode: "url" })}
          {text("google_place_id", "ID do Google Maps")}
          {text("cnpj", "CNPJ", { inputMode: "numeric" })}
        </div>
      </Section>

      <Section t="Contato">
        <div className="grid gap-3 sm:grid-cols-2">
          {text("decisor_nome", "Possível decisor")}
          {text("decisor_cargo", "Cargo / função")}
          <label className="block space-y-1">
            <span className="text-sm text-zinc-600">Confiança da identificação</span>
            <select className="field" value={f.decisor_confianca} onChange={(e) => set("decisor_confianca", e.target.value as Form["decisor_confianca"])}>
              <option value="">—</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </label>
          {text("decisor_canal_url", "Canal profissional do decisor", { inputMode: "url" })}
          {text("telefone", "Telefone comercial", { inputMode: "tel", placeholder: "(31) 3000-0000" })}
          {text("whatsapp", "WhatsApp comercial", { inputMode: "tel", placeholder: "(31) 90000-0000" })}
          <label className="block space-y-1">
            <span className="text-sm text-zinc-600">Número para contato</span>
            <select className="field" value={f.numero_preferido} onChange={(e) => set("numero_preferido", e.target.value as Form["numero_preferido"])}>
              <option value="whatsapp">WhatsApp</option>
              <option value="telefone">Telefone</option>
            </select>
          </label>
        </div>
      </Section>

      <Section t="Qualificação">
        {text("oportunidade", "Oportunidade comercial")}
        <div className="grid gap-3 sm:grid-cols-2">
          {numField("prioridade", "Prioridade (0–100)")}
          {text("prioridade_justificativa", "Justificativa da pontuação")}
          {text("fonte", "Fonte da informação")}
          {text("pesquisado_em", "Data da pesquisa", { type: "date" })}
          {text("verificado_em", "Última verificação", { type: "date" })}
        </div>
        <label className="block space-y-1">
          <span className="text-sm text-zinc-600">Observações</span>
          <textarea className="field min-h-24" maxLength={4000} value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
        </label>
      </Section>

      {Object.keys(errors).length > 0 && <p className="text-sm text-rose-600">Corrija os campos destacados.</p>}
      <button className="btn btn-primary w-full !py-3" type="submit">{submitLabel}</button>
    </form>
  );
}
