ALTER TABLE party_rooms ADD COLUMN round_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE party_players ADD COLUMN entry_id UUID;
-- Waiting tables created before paid admission must confirm the new entry fee.
UPDATE party_players p SET ready=false FROM party_rooms r
WHERE r.id=p.room_id AND r.kind='blackjack' AND r.status='waiting';
