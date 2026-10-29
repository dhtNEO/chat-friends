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
