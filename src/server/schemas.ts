import { z } from "zod";
import { onlyDigits, validCnpj } from "@/lib/dedupe";
import { IMPORT_FIELDS, MAX_ROWS } from "@/lib/import";
import { STATUS_KEYS } from "@/lib/types";
import { normalizePhone } from "@/lib/whatsapp";

const txt = (max: number) => z.string().max(max).transform((s) => s.trim());
const httpUrl = (max: number) =>
  txt(max).refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "url_invalida");
const phone = txt(40).refine((v) => !v || normalizePhone(v) !== null, "telefone_invalido");
const day = z.string().refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), "data_invalida");

export const uuid = z.string().uuid();

// Whitelist de campos graváveis. Campos de controle (id, origem, status de importação, datas) nunca vêm do cliente.
const fields = {
  nome: txt(200).pipe(z.string().min(2)),
  cidade: txt(100).pipe(z.string().min(2)),
  segmento: txt(100),
  bairro: txt(100),
  endereco: txt(300),
  google_maps_url: httpUrl(500),
  google_place_id: txt(200),
  nota_google: z.number().min(0).max(5).nullable(),
  qtd_avaliacoes: z.number().int().min(0).nullable(),
  site: httpUrl(300),
  instagram: txt(200),
  cnpj: txt(30)
    .refine((c) => !c || validCnpj(c), "cnpj_invalido")
    .transform((c) => onlyDigits(c)),
  decisor_nome: txt(120),
  decisor_cargo: txt(120),
  decisor_confianca: z.enum(["", "alta", "media", "baixa"]),
  decisor_canal_url: httpUrl(300),
  telefone: phone,
  whatsapp: phone,
  numero_preferido: z.enum(["whatsapp", "telefone"]),
  oportunidade: txt(500),
  prioridade: z.number().int().min(0).max(100),
  prioridade_justificativa: txt(1000),
  fonte: txt(300),
  pesquisado_em: day,
  verificado_em: day,
  observacoes: txt(4000),
  status: z.enum(STATUS_KEYS),
};

export const LEAD_FIELDS = Object.keys(fields) as (keyof typeof fields)[];

export const leadCreate = z.object({ id: uuid, ...fields }).partial().required({ id: true, nome: true, cidade: true });
export const leadPatch = z.object(fields).partial().refine((o) => Object.keys(o).length > 0, "vazio");

export const interactionCreate = z.object({
  id: uuid,
  lead_id: uuid,
  tipo: z.enum(["whatsapp_aberto", "mensagem_enviada", "ligacao", "resposta", "nota", "status_alterado"]),
  canal: txt(50).default(""),
  resposta: txt(1000).default(""),
  observacao: txt(1000).default(""),
  proxima_acao: txt(300).default(""),
  acompanhar_em: day.default(""),
});

export const templatesSchema = z.object({
  com_decisor: txt(1000).pipe(z.string().min(1)),
  sem_decisor: txt(1000).pipe(z.string().min(1)),
});

const importKeys = IMPORT_FIELDS.map((f) => f.key) as [string, ...string[]];
export const importSchema = z.object({
  arquivo: txt(300).pipe(z.string().min(1)),
  kind: z.enum(["csv", "xlsx"]),
  table: z
    .array(z.array(z.union([z.string().max(5000), z.number(), z.boolean(), z.null()])).max(80))
    .min(2)
    .max(MAX_ROWS + 1),
  mapping: z.partialRecord(z.enum(importKeys), z.number().int().min(0).max(79)),
  criarNovos: z.array(z.number().int().min(2).max(MAX_ROWS + 2)).max(MAX_ROWS).default([]),
});
