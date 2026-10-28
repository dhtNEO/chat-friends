CREATE TABLE account_mfa (
 account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 secret TEXT NOT NULL,
 last_step BIGINT NOT NULL DEFAULT -1
);
CREATE TABLE mfa_recovery (
 account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 code_hash CHAR(64) NOT NULL,
 PRIMARY KEY(account_id, code_hash)
);
-- Pre-hardening sessions have no absolute authentication timestamp. Require a new login.
DELETE FROM spring_session;
DELETE FROM media_connections;
UPDATE screen_lease SET identity=NULL,lease_id=NULL,expires_at=NULL;
