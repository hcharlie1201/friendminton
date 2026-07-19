CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_users_player_search
    ON users
    USING GIN ((display_name || ' ' || COALESCE(bio, '')) gin_trgm_ops);
