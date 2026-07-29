ALTER TABLE gatherings
    ADD COLUMN cancelled_at TIMESTAMPTZ;

CREATE INDEX idx_gatherings_active_starts_at
    ON gatherings (starts_at, id)
    WHERE cancelled_at IS NULL;
