-- =============================================================================
-- Esquema da Plataforma de Afiliados (SQLite)
-- Campos que guardam lista/objeto usam TEXT com JSON (o repositorio converte).
-- Datas: ISO-8601 em UTC.
-- =============================================================================

CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  parent_id     TEXT,
  nicho         TEXT,
  descricao     TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliate_programs (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  marketplace    TEXT NOT NULL,
  tipo           TEXT NOT NULL DEFAULT 'afiliado',
  identificador  TEXT,
  base_url       TEXT,
  parametro_tag  TEXT,
  comissao_media REAL,
  credenciais    TEXT,
  observacoes    TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  status_conexao TEXT DEFAULT 'nao_testado',
  testado_em     TEXT,
  criado_em      TEXT NOT NULL,
  atualizado_em  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id                     TEXT PRIMARY KEY,
  marketplace            TEXT NOT NULL,
  external_id            TEXT,
  sku                    TEXT,
  titulo_original        TEXT NOT NULL,
  titulo_publicacao      TEXT,
  descricao_original     TEXT,
  descricao_publicacao   TEXT,
  categoria              TEXT,
  subcategoria           TEXT,
  nicho                  TEXT,
  palavras_chave         TEXT,
  imagem_principal       TEXT,
  imagens                TEXT,
  url_original           TEXT,
  url_afiliado           TEXT,
  url_final              TEXT,
  preco_atual            REAL,
  preco_anterior         REAL,
  desconto_percentual    REAL,
  desconto_valor         REAL,
  moeda                  TEXT DEFAULT 'BRL',
  frete_gratis           INTEGER DEFAULT 0,
  frete_valor            REAL,
  avaliacao              REAL,
  quantidade_avaliacoes  INTEGER,
  quantidade_vendas      INTEGER,
  disponibilidade        TEXT DEFAULT 'disponivel',
  data_coleta            TEXT,
  data_atualizacao       TEXT,
  data_publicacao        TEXT,
  data_ultima_publicacao TEXT,
  status                 TEXT NOT NULL DEFAULT 'ativo',
  prioridade             INTEGER DEFAULT 0,
  score                  REAL DEFAULT 0,
  tags                   TEXT,
  origem                 TEXT DEFAULT 'manual',
  observacoes            TEXT,
  criado_em              TEXT NOT NULL,
  atualizado_em          TEXT NOT NULL,
  UNIQUE (marketplace, external_id)
);
CREATE INDEX IF NOT EXISTS idx_products_status      ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_marketplace ON products(marketplace);
CREATE INDEX IF NOT EXISTS idx_products_categoria   ON products(categoria);
CREATE INDEX IF NOT EXISTS idx_products_score       ON products(score DESC);

CREATE TABLE IF NOT EXISTS price_history (
  id             TEXT PRIMARY KEY,
  product_id     TEXT NOT NULL,
  preco_anterior REAL,
  preco_novo     REAL,
  variacao       REAL,
  origem         TEXT,
  criado_em      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);

CREATE TABLE IF NOT EXISTS coupons (
  id                    TEXT PRIMARY KEY,
  codigo                TEXT NOT NULL,
  nome                  TEXT,
  marketplace           TEXT,
  descricao             TEXT,
  tipo                  TEXT NOT NULL DEFAULT 'percentual',
  valor_desconto        REAL,
  valor_minimo          REAL,
  desconto_maximo       REAL,
  limite_uso            INTEGER,
  usos                  INTEGER DEFAULT 0,
  data_inicio           TEXT,
  data_fim              TEXT,
  produtos_aplicaveis   TEXT,
  categorias_aplicaveis TEXT,
  link                  TEXT,
  origem                TEXT DEFAULT 'proprio',
  status                TEXT NOT NULL DEFAULT 'ativo',
  observacoes           TEXT,
  criado_em             TEXT NOT NULL,
  atualizado_em         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_codigo ON coupons(codigo);

CREATE TABLE IF NOT EXISTS promotions (
  id                  TEXT PRIMARY KEY,
  nome                TEXT NOT NULL,
  product_id          TEXT,
  marketplace         TEXT,
  categoria           TEXT,
  preco_normal        REAL,
  preco_promocional   REAL,
  desconto_percentual REAL,
  desconto_valor      REAL,
  coupon_id           TEXT,
  frete_gratis        INTEGER DEFAULT 0,
  quantidade_limitada INTEGER,
  limite_utilizacao   INTEGER,
  data_inicio         TEXT,
  data_fim            TEXT,
  status              TEXT NOT NULL DEFAULT 'ativa',
  origem              TEXT DEFAULT 'manual',
  observacoes         TEXT,
  criado_em           TEXT NOT NULL,
  atualizado_em       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promotions_status  ON promotions(status);
CREATE INDEX IF NOT EXISTS idx_promotions_product ON promotions(product_id);

CREATE TABLE IF NOT EXISTS channels (
  id                TEXT PRIMARY KEY,
  nome              TEXT NOT NULL,
  identificador     TEXT NOT NULL,
  tipo              TEXT NOT NULL DEFAULT 'grupo',
  provider          TEXT NOT NULL DEFAULT 'waha',
  sessao            TEXT DEFAULT 'default',
  status            TEXT NOT NULL DEFAULT 'ativo',
  intervalo_minutos INTEGER DEFAULT 30,
  hora_inicio       TEXT DEFAULT '08:00',
  hora_fim          TEXT DEFAULT '22:00',
  limite_diario     INTEGER DEFAULT 20,
  observacoes       TEXT,
  ultimo_envio      TEXT,
  criado_em         TEXT NOT NULL,
  atualizado_em     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  descricao     TEXT,
  corpo         TEXT NOT NULL,
  tipo          TEXT DEFAULT 'oferta',
  padrao        INTEGER DEFAULT 0,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id                TEXT PRIMARY KEY,
  nome              TEXT NOT NULL,
  descricao         TEXT,
  modo              TEXT NOT NULL DEFAULT 'manual',
  template_id       TEXT,
  filtros           TEXT,
  saved_search_id   TEXT,
  produto_ids       TEXT,
  intervalo_minutos INTEGER DEFAULT 30,
  hora_inicio       TEXT DEFAULT '08:00',
  hora_fim          TEXT DEFAULT '22:00',
  dias_semana       TEXT,
  loop              INTEGER DEFAULT 1,
  nao_repetir_dias  INTEGER DEFAULT 7,
  limite_diario     INTEGER DEFAULT 20,
  usar_ia           INTEGER DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pausada',
  ultima_execucao   TEXT,
  proxima_execucao  TEXT,
  total_publicado   INTEGER DEFAULT 0,
  criado_em         TEXT NOT NULL,
  atualizado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

CREATE TABLE IF NOT EXISTS campaign_targets (
  id                TEXT PRIMARY KEY,
  campaign_id       TEXT NOT NULL,
  channel_id        TEXT NOT NULL,
  intervalo_minutos INTEGER,
  limite_diario     INTEGER,
  ativo             INTEGER NOT NULL DEFAULT 1,
  ultimo_envio      TEXT,
  criado_em         TEXT NOT NULL,
  atualizado_em     TEXT NOT NULL,
  UNIQUE (campaign_id, channel_id)
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  filtros       TEXT NOT NULL,
  ordenacao     TEXT DEFAULT 'score',
  quantidade    INTEGER DEFAULT 20,
  observacoes   TEXT,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publications (
  id                    TEXT PRIMARY KEY,
  campaign_id           TEXT,
  product_id            TEXT,
  promotion_id          TEXT,
  coupon_id             TEXT,
  channel_id            TEXT NOT NULL,
  template_id           TEXT,
  mensagem              TEXT,
  imagem                TEXT,
  preco_publicado       REAL,
  preco_final_publicado REAL,
  desconto_publicado    REAL,
  cupom_publicado       TEXT,
  status                TEXT NOT NULL DEFAULT 'aguardando',
  agendado_para         TEXT,
  enviado_em            TEXT,
  tentativas            INTEGER DEFAULT 0,
  proxima_tentativa     TEXT,
  erro                  TEXT,
  dry_run               INTEGER DEFAULT 0,
  provider_message_id   TEXT,
  origem                TEXT DEFAULT 'app',
  criado_em             TEXT NOT NULL,
  atualizado_em         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pub_status    ON publications(status);
CREATE INDEX IF NOT EXISTS idx_pub_agendado  ON publications(agendado_para);
CREATE INDEX IF NOT EXISTS idx_pub_produto   ON publications(product_id);
CREATE INDEX IF NOT EXISTS idx_pub_canal     ON publications(channel_id);

CREATE TABLE IF NOT EXISTS logs (
  id         TEXT PRIMARY KEY,
  timestamp  TEXT NOT NULL,
  level      TEXT NOT NULL,
  service    TEXT,
  message    TEXT,
  meta       TEXT,
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level     ON logs(level);

CREATE TABLE IF NOT EXISTS settings (
  chave         TEXT PRIMARY KEY,
  valor         TEXT,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id            TEXT PRIMARY KEY,
  tipo          TEXT NOT NULL,
  titulo        TEXT NOT NULL,
  detalhe       TEXT,
  referencia_id TEXT,
  severidade    TEXT DEFAULT 'info',
  lido          INTEGER DEFAULT 0,
  criado_em     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_lido ON alerts(lido);
