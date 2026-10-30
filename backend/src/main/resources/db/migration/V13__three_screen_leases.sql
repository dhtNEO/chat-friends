-- Preserve the existing reservation while adding two independent screen slots.
ALTER TABLE screen_lease DROP CONSTRAINT screen_lease_id_check;
ALTER TABLE screen_lease ADD CONSTRAINT screen_lease_id_check CHECK (id BETWEEN 1 AND 3);
CREATE UNIQUE INDEX screen_lease_identity_unique ON screen_lease(identity) WHERE identity IS NOT NULL;
INSERT INTO screen_lease(id) VALUES (2), (3);
