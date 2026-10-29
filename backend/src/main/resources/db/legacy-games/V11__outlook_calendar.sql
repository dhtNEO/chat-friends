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
