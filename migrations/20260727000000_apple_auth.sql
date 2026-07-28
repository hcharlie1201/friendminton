-- One-use, server-issued nonces bind native Sign in with Apple responses to
-- authentication attempts initiated through Friendminton.
CREATE TABLE auth_apple_challenges (
    nonce_hash BYTEA PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_apple_challenges_expires_at_idx
    ON auth_apple_challenges (expires_at);
