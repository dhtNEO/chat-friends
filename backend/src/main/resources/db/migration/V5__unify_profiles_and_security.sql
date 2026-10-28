-- Both released branches used V3. Its original SQL/checksum is selected from
-- history before validation; this migration supplies only the missing features.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7),
 ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7);
CREATE TABLE IF NOT EXISTS avatars (
 account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 content_type VARCHAR(20) NOT NULL, data BYTEA NOT NULL, version BIGINT NOT NULL
);
DO $$
BEGIN
 IF to_regclass(format('%I.account_mfa', current_schema())) IS NULL THEN
  CREATE TABLE account_mfa (
   account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
   secret TEXT NOT NULL, last_step BIGINT NOT NULL DEFAULT -1
  );
  CREATE TABLE mfa_recovery (
   account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   code_hash CHAR(64) NOT NULL, PRIMARY KEY(account_id, code_hash)
  );
  -- Only the profiles lineage still has pre-hardening sessions.
  DELETE FROM spring_session;
  DELETE FROM media_connections;
  UPDATE screen_lease SET identity=NULL,lease_id=NULL,expires_at=NULL;
 END IF;
END $$;
