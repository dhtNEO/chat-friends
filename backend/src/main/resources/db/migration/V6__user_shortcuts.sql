-- Atalhos pessoais de teclado, por conta e perfil de plataforma (macOS / Windows-Linux).
-- format_version versiona o formato de bindings; a API grava sempre a versão atual.
CREATE TABLE user_shortcuts (
 account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 platform VARCHAR(8) NOT NULL CHECK (platform IN ('mac','other')),
 revision BIGINT NOT NULL CHECK (revision > 0),
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 allow_while_typing BOOLEAN NOT NULL DEFAULT FALSE,
 format_version SMALLINT NOT NULL DEFAULT 1,
 bindings JSONB NOT NULL CHECK (jsonb_typeof(bindings) = 'array'),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (account_id, platform)
);
