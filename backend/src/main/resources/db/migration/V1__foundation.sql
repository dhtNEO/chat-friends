CREATE TABLE accounts (
 id UUID PRIMARY KEY, username VARCHAR(32) UNIQUE NOT NULL, display_name VARCHAR(64) NOT NULL,
 password_hash VARCHAR(100) NOT NULL, admin BOOLEAN NOT NULL DEFAULT FALSE,
 enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE messages (
 id BIGSERIAL PRIMARY KEY, author_id UUID NOT NULL REFERENCES accounts(id),
 client_id UUID NOT NULL, body VARCHAR(4000) NOT NULL CHECK(length(body)>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(author_id,client_id)
);
CREATE TABLE rate_limits (key VARCHAR(200) PRIMARY KEY, window_start TIMESTAMPTZ NOT NULL, hits INTEGER NOT NULL);
CREATE TABLE spring_session (
 primary_id CHAR(36) PRIMARY KEY, session_id CHAR(36) NOT NULL UNIQUE,
 creation_time BIGINT NOT NULL, last_access_time BIGINT NOT NULL,
 max_inactive_interval INT NOT NULL, expiry_time BIGINT NOT NULL, principal_name VARCHAR(100)
);
CREATE INDEX spring_session_expiry ON spring_session(expiry_time);
CREATE INDEX spring_session_principal ON spring_session(principal_name);
CREATE TABLE spring_session_attributes (
 session_primary_id CHAR(36) NOT NULL REFERENCES spring_session(primary_id) ON DELETE CASCADE,
 attribute_name VARCHAR(200) NOT NULL, attribute_bytes BYTEA NOT NULL,
 PRIMARY KEY(session_primary_id,attribute_name)
);
CREATE TABLE media_connections (
 identity VARCHAR(80) PRIMARY KEY, account_id UUID NOT NULL REFERENCES accounts(id),
 session_id VARCHAR(36) NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE screen_lease (
 id INT PRIMARY KEY CHECK(id=1), identity VARCHAR(80), lease_id UUID, expires_at TIMESTAMPTZ
);
INSERT INTO screen_lease(id) VALUES(1);
