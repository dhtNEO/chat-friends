-- Both released lineages used V6. Their original SQL/checksums are selected
-- before validation; this migration supplies only the missing feature set.
DO $$
BEGIN
 IF to_regclass(format('%I.coin_ledger', current_schema())) IS NULL THEN
  CREATE TABLE coin_ledger (
   id BIGSERIAL PRIMARY KEY,
   account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   reference UUID NOT NULL,
   amount INTEGER NOT NULL CHECK (amount >= 0 AND amount <= 500),
   reason VARCHAR(80) NOT NULL,
   created_at BIGINT NOT NULL,
   UNIQUE(account_id, reference)
  );
  CREATE INDEX coin_ledger_account ON coin_ledger(account_id, created_at DESC);
  CREATE TABLE game_spins (
   account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   client_id UUID NOT NULL,
   symbols VARCHAR(3) NOT NULL,
   reward INTEGER NOT NULL,
   created_at BIGINT NOT NULL,
   PRIMARY KEY(account_id, client_id)
  );
  CREATE TABLE game_rooms (
   id UUID PRIMARY KEY,
   host_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   creator_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   client_id UUID NOT NULL,
   solo BOOLEAN NOT NULL,
   status VARCHAR(12) NOT NULL CHECK(status IN ('waiting','running','finished','cancelled')),
   created_at BIGINT NOT NULL,
   starts_at BIGINT NOT NULL DEFAULT 0,
   ends_at BIGINT NOT NULL DEFAULT 0,
   target INTEGER NOT NULL DEFAULT 50 CHECK(target BETWEEN 20 AND 80),
   UNIQUE(creator_id, client_id)
  );
  CREATE TABLE game_players (
   room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
   account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   joined_at BIGINT NOT NULL,
   seen_at BIGINT NOT NULL,
   ready BOOLEAN NOT NULL DEFAULT FALSE,
   departed BOOLEAN NOT NULL DEFAULT FALSE,
   score INTEGER CHECK(score BETWEEN 0 AND 1000),
   reward INTEGER NOT NULL DEFAULT 0,
   PRIMARY KEY(room_id, account_id)
  );
  CREATE INDEX game_players_account ON game_players(account_id);

  -- Preserve the released V6 ledger and retire unfinished Na Mosca games.
  UPDATE game_rooms SET status='cancelled' WHERE status IN ('waiting','running');
  ALTER TABLE coin_ledger DROP CONSTRAINT coin_ledger_amount_check;
  ALTER TABLE coin_ledger ALTER COLUMN amount TYPE BIGINT;
  ALTER TABLE coin_ledger ADD COLUMN kind VARCHAR(12) NOT NULL DEFAULT 'grant';
  ALTER TABLE coin_ledger ADD CONSTRAINT coin_ledger_kind_amount CHECK (
   (kind='grant' AND amount BETWEEN 0 AND 500) OR
   (kind='stake' AND amount<0) OR
   (kind IN ('payout','refund') AND amount>0)
  );
  CREATE TABLE roulette_rounds (
   id UUID PRIMARY KEY,
   room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
   client_id UUID NOT NULL,
   number INTEGER CHECK(number BETWEEN 0 AND 36),
   settled BOOLEAN NOT NULL DEFAULT FALSE,
   UNIQUE(room_id,client_id)
  );
  ALTER TABLE game_rooms ADD COLUMN round_id UUID REFERENCES roulette_rounds(id);
  CREATE TABLE roulette_bets (
   id UUID PRIMARY KEY,
   round_id UUID NOT NULL REFERENCES roulette_rounds(id) ON DELETE CASCADE,
   account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   client_id UUID NOT NULL,
   choice VARCHAR(16) NOT NULL,
   amount BIGINT NOT NULL CHECK(amount>0),
   payout BIGINT NOT NULL DEFAULT 0 CHECK(payout>=0),
   refunded BOOLEAN NOT NULL DEFAULT FALSE,
   UNIQUE(round_id,account_id),
   UNIQUE(account_id,client_id)
  );

  -- Separate timestamp for the history of rounds; room.created_at changes between rounds.
  ALTER TABLE roulette_rounds ADD COLUMN created_at BIGINT NOT NULL
   DEFAULT (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  CREATE INDEX roulette_rounds_history ON roulette_rounds(room_id, created_at DESC);

  CREATE TABLE party_rooms (
   id UUID PRIMARY KEY, creator_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   host_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, client_id UUID NOT NULL,
   kind VARCHAR(12) NOT NULL CHECK(kind IN ('blackjack','rhythm')),
   status VARCHAR(12) NOT NULL CHECK(status IN ('waiting','preparing','running','finished','cancelled')),
   created_at BIGINT NOT NULL, starts_at BIGINT NOT NULL DEFAULT 0, ends_at BIGINT NOT NULL DEFAULT 0,
   state TEXT NOT NULL DEFAULT '{}', bot_released BOOLEAN NOT NULL DEFAULT FALSE, UNIQUE(creator_id,client_id)
  );
  CREATE TABLE party_players (
   room_id UUID NOT NULL REFERENCES party_rooms(id) ON DELETE CASCADE,
   account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   joined_at BIGINT NOT NULL, seen_at BIGINT NOT NULL, ready BOOLEAN NOT NULL DEFAULT FALSE,
   departed BOOLEAN NOT NULL DEFAULT FALSE, standing BOOLEAN NOT NULL DEFAULT FALSE,
   hand TEXT NOT NULL DEFAULT '[]', score INTEGER NOT NULL DEFAULT 0,
   hits INTEGER NOT NULL DEFAULT 0, combo INTEGER NOT NULL DEFAULT 0, best_combo INTEGER NOT NULL DEFAULT 0,
   reward INTEGER NOT NULL DEFAULT 0, voice_identity VARCHAR(80),
   PRIMARY KEY(room_id,account_id)
  );
  CREATE INDEX party_players_account ON party_players(account_id);
  CREATE TABLE party_actions (
   room_id UUID NOT NULL REFERENCES party_rooms(id) ON DELETE CASCADE,
   account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   client_id UUID NOT NULL, action VARCHAR(80) NOT NULL,
   PRIMARY KEY(room_id,account_id,client_id)
  );
  CREATE TABLE rhythm_hits (
   room_id UUID NOT NULL REFERENCES party_rooms(id) ON DELETE CASCADE,
   account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   note INTEGER NOT NULL, points INTEGER NOT NULL CHECK(points BETWEEN 0 AND 100),
   PRIMARY KEY(room_id,account_id,note)
  );

  ALTER TABLE party_rooms ADD COLUMN round_id UUID NOT NULL DEFAULT gen_random_uuid();
  ALTER TABLE party_players ADD COLUMN entry_id UUID;
  -- Waiting tables created before paid admission must confirm the new entry fee.
  UPDATE party_players p SET ready=false FROM party_rooms r
  WHERE r.id=p.room_id AND r.kind='blackjack' AND r.status='waiting';

  CREATE TABLE outlook_events (
   id UUID PRIMARY KEY,
   creator_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   client_id UUID NOT NULL,
   title VARCHAR(120) NOT NULL,
   game VARCHAR(80) NOT NULL DEFAULT '',
   location VARCHAR(160) NOT NULL DEFAULT '',
   description VARCHAR(2000) NOT NULL DEFAULT '',
   starts_at TIMESTAMPTZ NOT NULL,
   ends_at TIMESTAMPTZ NOT NULL,
   cancelled BOOLEAN NOT NULL DEFAULT FALSE,
   version INTEGER NOT NULL DEFAULT 1,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
   CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '48 hours'),
   UNIQUE(creator_id, client_id)
  );
  CREATE INDEX outlook_events_time ON outlook_events(starts_at, ends_at);
  CREATE TABLE outlook_attendees (
   event_id UUID NOT NULL REFERENCES outlook_events(id) ON DELETE CASCADE,
   account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   response VARCHAR(10) NOT NULL CHECK(response IN ('going','maybe','declined')),
   PRIMARY KEY(event_id,account_id)
  );
 END IF;
END $$;

-- Atalhos pessoais de teclado, por conta e perfil de plataforma (macOS / Windows-Linux).
-- format_version versiona o formato de bindings; a API grava sempre a versão atual.
CREATE TABLE IF NOT EXISTS user_shortcuts (
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
