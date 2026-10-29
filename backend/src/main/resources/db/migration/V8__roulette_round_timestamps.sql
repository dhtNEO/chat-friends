-- Separate timestamp for the history of rounds; room.created_at changes between rounds.
ALTER TABLE roulette_rounds ADD COLUMN created_at BIGINT NOT NULL
 DEFAULT (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
CREATE INDEX roulette_rounds_history ON roulette_rounds(room_id, created_at DESC);
