ALTER TABLE posts
    ADD COLUMN location TEXT,
    ADD COLUMN effort SMALLINT CHECK (effort BETWEEN 1 AND 10),
    ADD COLUMN image_urls TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE posts DROP CONSTRAINT posts_body_check;
ALTER TABLE posts ADD CONSTRAINT posts_body_check CHECK (char_length(body) <= 2000);
