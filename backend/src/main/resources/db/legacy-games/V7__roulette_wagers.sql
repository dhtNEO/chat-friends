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
