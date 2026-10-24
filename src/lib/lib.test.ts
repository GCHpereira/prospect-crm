import { describe, expect, it } from "vitest";
import { dedupeKey, validCnpj } from "./dedupe";
import { applyImport, autoMap, parseRows } from "./import";
import { EMPTY_LEAD, DEFAULT_TEMPLATES, type Lead } from "./types";
import { buildMessage, normalizePhone, pickNumber, waLink } from "./whatsapp";

const lead = (o: Partial<Lead> = {}): Lead => ({
  ...EMPTY_LEAD, id: "1", nome: "Auto Estética Luz", cidade: "Belo Horizonte",
  whatsapp: "(31) 98888-7777", created_at: "", updated_at: "", ...o,
});

describe("whatsapp", () => {
  it("normaliza telefones", () => {
    expect(normalizePhone("(31) 98888-7777")).toBe("5531988887777");
    expect(normalizePhone("+55 31 3222-1111")).toBe("553132221111");
    expect(normalizePhone("031 98888 7777")).toBe("5531988887777");
    expect(normalizePhone("5531988887777")).toBe("5531988887777");
  });
  it("rejeita inválidos", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone("(31) 88888-7777")).toBeNull(); // 11 dígitos sem 9
    expect(normalizePhone("(00) 98888-7777")).toBeNull();
  });
  it("usa o número preferido e cai no outro", () => {
    const l = lead({ telefone: "(31) 3222-1111", numero_preferido: "telefone" });
    expect(pickNumber(l)).toBe("553132221111");
    expect(pickNumber({ ...l, telefone: "xx" })).toBe("5531988887777");
  });
  it("monta mensagem com e sem decisor", () => {
    expect(buildMessage(lead({ decisor_nome: "Carlos" }), DEFAULT_TEMPLATES)).toBe(
      "Olá, tudo bem? Meu nome é [SEU NOME]. Consigo falar com Carlos, responsável pela Auto Estética Luz, por esse número?",
    );
    expect(buildMessage(lead(), DEFAULT_TEMPLATES)).toContain("responsável pela Auto Estética Luz. Consigo");
  });
  it("gera link wa.me codificado", () => {
    const u = new URL(waLink(lead(), DEFAULT_TEMPLATES)!);
    expect(u.origin + u.pathname).toBe("https://wa.me/5531988887777");
    expect(u.searchParams.get("text")).toContain("Auto Estética Luz");
    expect(waLink(lead({ whatsapp: "" }), DEFAULT_TEMPLATES)).toBeNull();
  });
});

describe("dedupe", () => {
  it("ignora acento, caixa e pontuação", () => {
    expect(dedupeKey("Clínica  São José!", "Belo Horizonte")).toBe(dedupeKey("clinica sao jose", "belo horizonte"));
  });
  it("valida CNPJ", () => {
    expect(validCnpj("11.222.333/0001-81")).toBe(true);
    expect(validCnpj("11.222.333/0001-82")).toBe(false);
    expect(validCnpj("00000000000000")).toBe(false);
  });
});

const H = ["Empresa", "Cidade", "Nota", "Avaliações", "WhatsApp", "Place ID", "CNPJ", "Prioridade"];
const run = (rows: unknown[][], existing: Lead[] = []) => {
  const t = [H, ...rows];
  return parseRows(t, autoMap(H), existing);
};

describe("importação", () => {
  it("mapeia cabeçalhos por alias", () => {
    const m = autoMap(H);
    expect(m.nome).toBe(0);
    expect(m.qtd_avaliacoes).toBe(3);
    expect(m.google_place_id).toBe(5);
  });
  it("valida linhas", () => {
    const r = run([
      ["Studio X", "BH", "4,8", 120, "31 98888-1111", "p1", "", ""],
      ["", "BH", "4,8", 10, "31 98888-1111", "", "", ""],
      ["Sem Fone", "BH", "4", 10, "", "", "", ""],
      ["Nota Ruim", "BH", "9", 10, "31 98888-1111", "", "", ""],
      ["CNPJ Ruim", "BH", "4", 10, "31 98888-1111", "", "123", ""],
    ]);
    expect(r.map((x) => x.state)).toEqual(["nova", "invalida", "invalida", "invalida", "invalida"]);
    expect(r[0].data!.nota_google).toBe(4.8);
    expect(r[0].data!.prioridade).toBe(50);
  });
  it("detecta duplicados no arquivo e existentes", () => {
    const ex = [lead({ id: "a", google_place_id: "p9" }), lead({ id: "b", nome: "Outro Lugar", cidade: "Contagem" })];
    const r = run([
      ["Nova Loja", "BH", 4.6, 50, "31 98888-1111", "p1", "", ""],
      ["Nova Loja 2", "BH", 4.6, 50, "31 98888-2222", "p1", "", ""], // mesmo place id
      ["Nome Diferente", "BH", 4.6, 50, "31 98888-3333", "p9", "", ""], // atualiza a
      ["outro lugar", "Contagem", 4.6, 50, "31 98888-4444", "", "", ""], // fraco
    ], ex);
    expect(r.map((x) => x.state)).toEqual(["nova", "duplicada_no_arquivo", "atualiza", "possivel_duplicado"]);
    expect(r[2].matchId).toBe("a");
  });
  it("não sobrescreve campos preenchidos e é idempotente", () => {
    const ex = [lead({ id: "a", google_place_id: "p9", observacoes: "minha nota", segmento: "", status: "respondeu" })];
    const rows = parseRows(
      [["Empresa", "Cidade", "Place ID", "WhatsApp", "Segmento", "Observações"],
       ["Auto Estética Luz", "BH", "p9", "31 98888-7777", "Estética", "da planilha"]],
      autoMap(["Empresa", "Cidade", "Place ID", "WhatsApp", "Segmento", "Observações"]), ex,
    );
    const a = applyImport(rows, ex, "csv", new Set(), () => "n", "now");
    expect(a.leads[0].observacoes).toBe("minha nota");
    expect(a.leads[0].segmento).toBe("Estética");
    expect(a.leads[0].status).toBe("respondeu");
    const rows2 = parseRows(
      [["Empresa", "Cidade", "Place ID", "WhatsApp"], ["Auto Estética Luz", "BH", "p9", "31 98888-7777"]],
      autoMap(["Empresa", "Cidade", "Place ID", "WhatsApp"]), a.leads,
    );
    expect(applyImport(rows2, a.leads, "csv", new Set(), () => "n", "now").leads).toHaveLength(1);
  });
  it("possível duplicado só entra se confirmado", () => {
    const ex = [lead({ id: "b", nome: "Outro Lugar", cidade: "Contagem" })];
    const rows = run([["Outro Lugar", "Contagem", 4.5, 10, "31 98888-4444", "", "", ""]], ex);
    expect(applyImport(rows, ex, "csv", new Set(), () => "n", "t").leads).toHaveLength(1);
    const r = applyImport(rows, ex, "csv", new Set([2]), () => "n", "t");
    expect(r.leads).toHaveLength(2);
    expect(r.leads[0].possivel_duplicado_de).toBe("b");
  });
  it("neutraliza fórmulas", () => {
    const r = run([["=HYPERLINK(\"x\")", "BH", 4, 10, "31 98888-1111", "", "", ""]]);
    expect(r[0].data!.nome.startsWith("'")).toBe(true);
  });
});
