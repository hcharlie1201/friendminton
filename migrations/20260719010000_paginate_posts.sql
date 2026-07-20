DROP INDEX IF EXISTS idx_posts_feed;

CREATE INDEX idx_posts_feed ON posts (created_at DESC, id DESC);
