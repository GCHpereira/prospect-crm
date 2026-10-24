-- Prospect CRM: schema inicial (Cloudflare D1 / SQLite).
-- Aplicar: cf d1 migrations apply <id-do-banco>   (local: com --local)
-- Autorização NÃO é feita aqui (D1 não tem RLS): toda gravação/leitura passa pelo servidor,
-- que só atende o e-mail autorizado pelo Cloudflare Access. O banco nunca é exposto ao navegador.

CREATE TABLE import_batches (
  id         TEXT PRIMARY KEY,
  arquivo    TEXT NOT NULL CHECK (length(arquivo) <= 300),
  origem     TEXT NOT NULL CHECK (origem IN ('csv', 'xlsx')),
  relatorio  TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE leads (
  id                       TEXT PRIMARY KEY,

  nome                     TEXT NOT NULL CHECK (length(nome) BETWEEN 2 AND 200),
  segmento                 TEXT NOT NULL DEFAULT '' CHECK (length(segmento) <= 100),
  cidade                   TEXT NOT NULL CHECK (length(cidade) BETWEEN 2 AND 100),
  bairro                   TEXT NOT NULL DEFAULT '' CHECK (length(bairro) <= 100),
  endereco                 TEXT NOT NULL DEFAULT '' CHECK (length(endereco) <= 300),
  google_maps_url          TEXT NOT NULL DEFAULT '' CHECK (length(google_maps_url) <= 500 AND (google_maps_url = '' OR google_maps_url LIKE 'http://%' OR google_maps_url LIKE 'https://%')),
  google_place_id          TEXT NOT NULL DEFAULT '' CHECK (length(google_place_id) <= 200),
  nota_google              REAL CHECK (nota_google IS NULL OR nota_google BETWEEN 0 AND 5),
  qtd_avaliacoes           INTEGER CHECK (qtd_avaliacoes IS NULL OR qtd_avaliacoes >= 0),
  site                     TEXT NOT NULL DEFAULT '' CHECK (length(site) <= 300 AND (site = '' OR site LIKE 'http://%' OR site LIKE 'https://%')),
  instagram                TEXT NOT NULL DEFAULT '' CHECK (length(instagram) <= 200),
  cnpj                     TEXT NOT NULL DEFAULT '' CHECK (cnpj = '' OR (length(cnpj) = 14 AND cnpj NOT GLOB '*[^0-9]*')),

  decisor_nome             TEXT NOT NULL DEFAULT '' CHECK (length(decisor_nome) <= 120),
  decisor_cargo            TEXT NOT NULL DEFAULT '' CHECK (length(decisor_cargo) <= 120),
  decisor_confianca        TEXT NOT NULL DEFAULT '' CHECK (decisor_confianca IN ('', 'alta', 'media', 'baixa')),
  decisor_canal_url        TEXT NOT NULL DEFAULT '' CHECK (length(decisor_canal_url) <= 300 AND (decisor_canal_url = '' OR decisor_canal_url LIKE 'http://%' OR decisor_canal_url LIKE 'https://%')),
  telefone                 TEXT NOT NULL DEFAULT '' CHECK (length(telefone) <= 40),
  whatsapp                 TEXT NOT NULL DEFAULT '' CHECK (length(whatsapp) <= 40),
  numero_preferido         TEXT NOT NULL DEFAULT 'whatsapp' CHECK (numero_preferido IN ('whatsapp', 'telefone')),

  oportunidade             TEXT NOT NULL DEFAULT '' CHECK (length(oportunidade) <= 500),
  prioridade               INTEGER NOT NULL DEFAULT 50 CHECK (prioridade BETWEEN 0 AND 100),
  prioridade_justificativa TEXT NOT NULL DEFAULT '' CHECK (length(prioridade_justificativa) <= 1000),
  fonte                    TEXT NOT NULL DEFAULT '' CHECK (length(fonte) <= 300),
  pesquisado_em            TEXT NOT NULL DEFAULT '' CHECK (pesquisado_em = '' OR pesquisado_em GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  verificado_em            TEXT NOT NULL DEFAULT '' CHECK (verificado_em = '' OR verificado_em GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  observacoes              TEXT NOT NULL DEFAULT '' CHECK (length(observacoes) <= 4000),

  status                   TEXT NOT NULL DEFAULT 'novo' CHECK (status IN (
                             'novo', 'contato_iniciado', 'aguardando_resposta', 'respondeu', 'reuniao_marcada',
                             'proposta_enviada', 'negociacao', 'fechado', 'sem_interesse', 'descartado')),
  origem                   TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'csv', 'xlsx')),
  import_batch_id          TEXT REFERENCES import_batches (id) ON DELETE SET NULL,
  dedupe_key               TEXT NOT NULL,
  possivel_duplicado_de    TEXT REFERENCES leads (id) ON DELETE SET NULL,

  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

-- Identificadores fortes: únicos. dedupe_key NÃO é único (nome parecido != duplicado).
CREATE UNIQUE INDEX leads_place_uidx ON leads (google_place_id) WHERE google_place_id <> '';
CREATE UNIQUE INDEX leads_cnpj_uidx  ON leads (cnpj) WHERE cnpj <> '';
CREATE INDEX leads_dedupe_idx   ON leads (dedupe_key);
CREATE INDEX leads_status_idx   ON leads (status);
CREATE INDEX leads_prio_idx     ON leads (prioridade DESC);
CREATE INDEX leads_created_idx  ON leads (created_at DESC);

CREATE TABLE interactions (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('whatsapp_aberto', 'mensagem_enviada', 'ligacao', 'resposta', 'nota', 'status_alterado')),
  canal         TEXT NOT NULL DEFAULT '' CHECK (length(canal) <= 50),
  resposta      TEXT NOT NULL DEFAULT '' CHECK (length(resposta) <= 1000),
  observacao    TEXT NOT NULL DEFAULT '' CHECK (length(observacao) <= 1000),
  proxima_acao  TEXT NOT NULL DEFAULT '' CHECK (length(proxima_acao) <= 300),
  acompanhar_em TEXT NOT NULL DEFAULT '' CHECK (acompanhar_em = '' OR acompanhar_em GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at    TEXT NOT NULL
);
CREATE INDEX interactions_lead_idx ON interactions (lead_id, created_at DESC);

CREATE TABLE message_templates (
  chave      TEXT PRIMARY KEY CHECK (chave IN ('com_decisor', 'sem_decisor')),
  texto      TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 1000),
  updated_at TEXT NOT NULL
);
