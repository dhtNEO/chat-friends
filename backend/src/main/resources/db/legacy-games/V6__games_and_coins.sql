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
