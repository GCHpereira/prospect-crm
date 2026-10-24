export const STATUSES = [
  { key: "novo", label: "Novo", cls: "bg-sky-100 text-sky-800" },
  { key: "contato_iniciado", label: "Contato iniciado", cls: "bg-indigo-100 text-indigo-800" },
  { key: "aguardando_resposta", label: "Aguardando resposta", cls: "bg-amber-100 text-amber-800" },
  { key: "respondeu", label: "Respondeu", cls: "bg-teal-100 text-teal-800" },
  { key: "reuniao_marcada", label: "Reunião marcada", cls: "bg-violet-100 text-violet-800" },
  { key: "proposta_enviada", label: "Proposta enviada", cls: "bg-fuchsia-100 text-fuchsia-800" },
  { key: "negociacao", label: "Negociação", cls: "bg-orange-100 text-orange-800" },
  { key: "fechado", label: "Fechado", cls: "bg-emerald-100 text-emerald-800" },
  { key: "sem_interesse", label: "Sem interesse", cls: "bg-zinc-200 text-zinc-700" },
  { key: "descartado", label: "Descartado", cls: "bg-red-100 text-red-800" },
] as const;

export type Status = (typeof STATUSES)[number]["key"];
export const STATUS_KEYS = STATUSES.map((s) => s.key) as [Status, ...Status[]];
export const statusInfo = (k: Status) => STATUSES.find((s) => s.key === k)!;

export type Confianca = "alta" | "media" | "baixa";
export type NumeroPreferido = "whatsapp" | "telefone";

export type Lead = {
  id: string;
  nome: string;
  segmento: string;
  cidade: string;
  bairro: string;
  endereco: string;
  google_maps_url: string;
  google_place_id: string;
  nota_google: number | null;
  qtd_avaliacoes: number | null;
  site: string;
  instagram: string;
  cnpj: string;
  decisor_nome: string;
  decisor_cargo: string;
  decisor_confianca: Confianca | "";
  decisor_canal_url: string;
  telefone: string;
  whatsapp: string;
  numero_preferido: NumeroPreferido;
  oportunidade: string;
  prioridade: number;
  prioridade_justificativa: string;
  fonte: string;
  pesquisado_em: string;
  verificado_em: string;
  observacoes: string;
  status: Status;
  origem: "manual" | "csv" | "xlsx";
  possivel_duplicado_de: string;
  created_at: string;
  updated_at: string;
};

export type InteractionTipo =
  | "whatsapp_aberto"
  | "mensagem_enviada"
  | "ligacao"
  | "resposta"
  | "nota"
  | "status_alterado";

export type Interaction = {
  id: string;
  lead_id: string;
  tipo: InteractionTipo;
  canal: string;
  resposta: string;
  observacao: string;
  proxima_acao: string;
  acompanhar_em: string;
  created_at: string;
};

export const TIPO_LABEL: Record<InteractionTipo, string> = {
  whatsapp_aberto: "WhatsApp aberto",
  mensagem_enviada: "Mensagem enviada",
  ligacao: "Ligação",
  resposta: "Resposta recebida",
  nota: "Nota",
  status_alterado: "Status alterado",
};

export type Templates = { com_decisor: string; sem_decisor: string };

export const DEFAULT_TEMPLATES: Templates = {
  com_decisor:
    "Olá, tudo bem? Meu nome é [SEU NOME]. Consigo falar com {decisor}, responsável pela {empresa}, por esse número?",
  sem_decisor:
    "Olá, tudo bem? Meu nome é [SEU NOME]. Gostaria de falar com o responsável pela {empresa}. Consigo contato por esse número?",
};

export const EMPTY_LEAD: Omit<Lead, "id" | "created_at" | "updated_at"> = {
  nome: "", segmento: "", cidade: "", bairro: "", endereco: "",
  google_maps_url: "", google_place_id: "", nota_google: null, qtd_avaliacoes: null,
  site: "", instagram: "", cnpj: "",
  decisor_nome: "", decisor_cargo: "", decisor_confianca: "", decisor_canal_url: "",
  telefone: "", whatsapp: "", numero_preferido: "whatsapp",
  oportunidade: "", prioridade: 50, prioridade_justificativa: "", fonte: "",
  pesquisado_em: "", verificado_em: "", observacoes: "",
  status: "novo", origem: "manual", possivel_duplicado_de: "",
};
