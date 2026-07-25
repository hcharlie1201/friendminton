-- Friendminton owns email-action tokens instead of exposing Better Auth
-- 0.10's non-atomic verification and password-reset handlers.
CREATE TABLE auth_email_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, purpose)
);

CREATE INDEX idx_auth_email_tokens_expires_at
    ON auth_email_tokens (expires_at);
