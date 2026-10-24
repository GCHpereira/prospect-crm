export const norm = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Chave fraca (nome + cidade). Só sinaliza "possível duplicado", nunca decide sozinha. */
export const dedupeKey = (nome: string, cidade: string) => `${norm(nome)}|${norm(cidade)}`;

export const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

export function validCnpj(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (len: number) => {
    let sum = 0, w = len - 7;
    for (let i = 0; i < len; i++) {
      sum += Number(c[i]) * w--;
      if (w < 2) w = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
