import type { Lead, Templates } from "./types";

/** Normaliza telefone brasileiro para formato internacional (só dígitos). null se inválido. */
export function normalizePhone(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (d.length !== 10 && d.length !== 11) return null;
  if (/^[1-9]0|^0/.test(d)) return null; // DDD inválido
  if (d.length === 11 && d[2] !== "9") return null; // celular tem 9
  return "55" + d;
}

/** Número a usar: o preferido; se inválido ou vazio, o outro. */
export function pickNumber(l: Pick<Lead, "whatsapp" | "telefone" | "numero_preferido">): string | null {
  const order = l.numero_preferido === "telefone" ? [l.telefone, l.whatsapp] : [l.whatsapp, l.telefone];
  for (const n of order) {
    const p = normalizePhone(n);
    if (p) return p;
  }
  return null;
}

export function buildMessage(l: Pick<Lead, "nome" | "decisor_nome">, t: Templates): string {
  const tpl = l.decisor_nome.trim() ? t.com_decisor : t.sem_decisor;
  return tpl.replaceAll("{decisor}", l.decisor_nome.trim()).replaceAll("{empresa}", l.nome.trim());
}

export function waLink(l: Lead, t: Templates): string | null {
  const num = pickNumber(l);
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(buildMessage(l, t))}` : null;
}
