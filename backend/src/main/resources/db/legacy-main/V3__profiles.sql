ALTER TABLE accounts ADD COLUMN primary_color VARCHAR(7), ADD COLUMN secondary_color VARCHAR(7);
CREATE TABLE avatars (
 account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 content_type VARCHAR(20) NOT NULL, data BYTEA NOT NULL, version BIGINT NOT NULL
);
