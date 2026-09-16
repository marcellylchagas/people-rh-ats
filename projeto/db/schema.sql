-- People RH ATS — schema de produção
-- O estado principal do ATS (candidatos, vagas, candidaturas e histórico)
-- fica em um único documento JSONB, no mesmo formato que o front-end já usa.
-- Isso preserva 100% da lógica existente das telas, só trocando o armazenamento
-- de localStorage (por navegador) para um banco compartilhado de verdade.

CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL DEFAULT '{"candidates":[],"vacancies":[],"applications":[],"history":[]}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_state (id, payload)
VALUES (1, '{"candidates":[],"vacancies":[],"applications":[],"history":[]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Credenciais de login dos candidatos (senha sempre com hash, nunca em texto puro).
-- O login do administrador NÃO fica no banco: usa as variáveis de ambiente
-- ADMIN_EMAIL e ADMIN_PASSWORD, definidas só no servidor.
CREATE TABLE IF NOT EXISTS candidate_credentials (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessões de login (tanto do administrador quanto dos candidatos).
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL CHECK (session_type IN ('admin','candidate')),
  candidate_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
