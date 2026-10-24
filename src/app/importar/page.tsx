"use client";
import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useState } from "react";
import { autoMap, IMPORT_FIELDS, MAX_FILE_BYTES, MAX_ROWS, parseRows, type ImportReport, type Mapping, type ParsedRow } from "@/lib/import";
import { useStore } from "@/lib/store";

const LABEL: Record<ParsedRow["state"], { t: string; cls: string }> = {
  nova: { t: "Nova", cls: "bg-emerald-100 text-emerald-800" },
  atualiza: { t: "Atualiza (só campos vazios)", cls: "bg-sky-100 text-sky-800" },
  possivel_duplicado: { t: "Possível duplicado", cls: "bg-amber-100 text-amber-800" },
  duplicada_no_arquivo: { t: "Repetida no arquivo", cls: "bg-zinc-200 text-zinc-700" },
  invalida: { t: "Inválida", cls: "bg-red-100 text-red-800" },
};

export default function Importar() {
  const { leads, importLeads } = useStore();
  const [table, setTable] = useState<unknown[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [kind, setKind] = useState<"csv" | "xlsx">("csv");
  const [mapping, setMapping] = useState<Mapping>({});
  const [novos, setNovos] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);

  const rows = useMemo(() => (table ? parseRows(table, mapping, leads) : []), [table, mapping, leads]);
  const counts = useMemo(() => {
    const c = { nova: 0, atualiza: 0, possivel_duplicado: 0, duplicada_no_arquivo: 0, invalida: 0 };
    rows.forEach((r) => c[r.state]++);
    return c;
  }, [rows]);

  async function onFile(file: File | undefined) {
    setError(""); setReport(null); setTable(null); setNovos(new Set());
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "csv" && ext !== "xlsx") return setError("Envie um arquivo .csv ou .xlsx.");
    if (file.size > MAX_FILE_BYTES) return setError("Arquivo maior que 2 MB.");
    try {
      let data: unknown[][];
      if (ext === "csv") {
        const text = (await file.text()).replace(/^﻿/, "");
        const res = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimiter: text.split("\n")[0].includes(";") && !text.split("\n")[0].includes(",") ? ";" : "" });
        data = res.data;
      } else {
        const { readSheet } = await import("read-excel-file/browser");
        data = (await readSheet(file)) as unknown[][];
      }
      if (data.length < 2) return setError("O arquivo não tem linhas de dados.");
      if (data.length - 1 > MAX_ROWS) return setError(`Máximo de ${MAX_ROWS} linhas por importação (o arquivo tem ${data.length - 1}). Divida a planilha.`);
      const headers = (data[0] as unknown[]).map((h) => String(h ?? ""));
      setKind(ext); setFileName(file.name); setTable(data); setMapping(autoMap(headers));
    } catch {
      setError("Não foi possível ler o arquivo. Verifique se ele não está corrompido.");
    }
  }

  const headers = table ? (table[0] as unknown[]).map((h, i) => ({ i, name: String(h ?? "").trim() || `Coluna ${i + 1}` })) : [];
  const required = !(mapping.nome !== undefined && mapping.cidade !== undefined);

  const [busy, setBusy] = useState(false);
  const doImport = async () => {
    if (!table) return;
    setBusy(true); setError("");
    try {
      // O servidor revalida tudo e grava em uma transação única; a prévia acima é só conferência.
      const r = await importLeads({ arquivo: fileName, kind, table, mapping, criarNovos: [...novos] });
      setReport(r); setTable(null);
    } catch {
      setError("A importação falhou e nada foi gravado. Verifique a planilha e tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Importar planilha</h1>

      {report ? (
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold">Importação concluída</h2>
          <ul className="space-y-1 text-sm">
            <li>Linhas lidas: {report.total}</li>
            <li>Novos leads: <b>{report.novos}</b>{report.sinalizados > 0 && ` (${report.sinalizados} sinalizados como possível duplicado)`}</li>
            <li>Existentes completados: {report.atualizados}</li>
            <li>Duplicados ignorados: {report.duplicados}</li>
            <li>Inválidos: {report.invalidos}</li>
          </ul>
          <div className="flex gap-2"><Link href="/leads" className="btn btn-primary">Ver leads</Link><button className="btn btn-ghost" onClick={() => setReport(null)}>Importar outro</button></div>
        </div>
      ) : (
        <>
          <div className="card space-y-3 p-4">
            <input type="file" accept=".csv,.xlsx" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white" />
            <p className="text-xs text-zinc-500">CSV ou XLSX, até 2 MB e {MAX_ROWS} linhas. O arquivo é lido no seu navegador. Obrigatórios: empresa, cidade e um telefone ou WhatsApp válido.</p>
            <a href="/modelo-leads.csv" download className="text-sm text-emerald-700 underline">Baixar modelo padrão de colunas</a>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>

          {table && (
            <>
              <section className="card space-y-3 p-4">
                <h2 className="font-medium">1. Mapear colunas <span className="text-sm font-normal text-zinc-400">({fileName})</span></h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {IMPORT_FIELDS.map((f) => (
                    <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-zinc-600">{f.label}</span>
                      <select
                        className="field !w-44 !py-1.5 text-sm"
                        value={mapping[f.key] ?? ""}
                        onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === "") delete n[f.key]; else n[f.key] = Number(e.target.value); return n; })}
                      >
                        <option value="">— ignorar —</option>
                        {headers.map((h) => <option key={h.i} value={h.i}>{h.name}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                {required && <p className="text-sm text-rose-600">Mapeie as colunas de empresa e cidade.</p>}
              </section>

              {!required && (
                <section className="card space-y-3 p-4">
                  <h2 className="font-medium">2. Prévia</h2>
                  <p className="text-sm text-zinc-600">
                    {counts.nova} novas · {counts.atualiza} atualizam · {counts.possivel_duplicado} possíveis duplicadas · {counts.duplicada_no_arquivo} repetidas · {counts.invalida} inválidas
                  </p>
                  <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-3 py-2">Linha</th><th className="px-3 py-2">Empresa</th><th className="px-3 py-2">Situação</th></tr></thead>
                      <tbody className="divide-y divide-zinc-100">
                        {rows.map((r) => (
                          <tr key={r.line}>
                            <td className="px-3 py-2 text-zinc-400">{r.line}</td>
                            <td className="px-3 py-2">{r.data?.nome ?? "—"}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LABEL[r.state].cls}`}>{LABEL[r.state].t}</span>
                              {r.errors.length > 0 && <span className="ml-2 text-xs text-rose-600">{r.errors.join("; ")}</span>}
                              {r.state === "possivel_duplicado" && (
                                <label className="ml-2 text-xs">
                                  <input type="checkbox" className="mr-1" checked={novos.has(r.line)} onChange={(e) => setNovos((s) => { const n = new Set(s); if (e.target.checked) n.add(r.line); else n.delete(r.line); return n; })} />
                                  criar mesmo assim
                                </label>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="btn btn-primary w-full !py-3" disabled={busy || counts.nova + counts.atualiza + novos.size === 0} onClick={doImport}>
                    {busy ? "Importando…" : "Importar registros válidos"}
                  </button>
                </section>
              )}
            </>
          )}

          <section className="card space-y-2 p-4 text-sm">
            <h2 className="font-medium">Instrução para o Claude gerar a planilha</h2>
            <p className="text-zinc-600">Cole no Claude junto com o pedido de pesquisa:</p>
            <pre className="whitespace-pre-wrap break-all rounded-lg bg-zinc-50 p-3 text-xs">{CLAUDE_PROMPT}</pre>
            <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(CLAUDE_PROMPT)}>Copiar instrução</button>
          </section>
        </>
      )}
    </div>
  );
}

const CLAUDE_PROMPT = `Entregue o resultado como CSV (UTF-8, separador vírgula) com EXATAMENTE estas colunas, nesta ordem, na primeira linha:
nome,cidade,segmento,bairro,endereco,google_maps_url,google_place_id,nota_google,qtd_avaliacoes,site,instagram,cnpj,decisor_nome,decisor_cargo,decisor_confianca,decisor_canal_url,telefone,whatsapp,numero_preferido,oportunidade,prioridade,prioridade_justificativa,fonte,pesquisado_em,observacoes
Regras: uma empresa por linha; nome e cidade obrigatórios; pelo menos um telefone ou whatsapp com DDD; nota_google de 0 a 5 (ponto decimal); decisor_confianca = alta, media ou baixa; numero_preferido = whatsapp ou telefone; prioridade de 0 a 100; pesquisado_em no formato AAAA-MM-DD; deixe vazio o que não souber, sem inventar; cnpj só se confirmado.`;
