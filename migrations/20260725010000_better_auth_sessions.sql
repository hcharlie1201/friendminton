-- Better Auth owns authentication fields while Friendminton keeps users.id as
-- the stable UUID referenced by product-domain tables.
ALTER TABLE users
    ADD COLUMN auth_user_id TEXT,
    ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN image TEXT,
    ADD COLUMN username TEXT,
    ADD COLUMN display_username TEXT,
    ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN role TEXT,
    ADD COLUMN banned BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN ban_reason TEXT,
    ADD COLUMN ban_expires TIMESTAMPTZ,
    ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Existing users keep their Friendminton UUID. Google OAuth can find them by
-- normalized email and attach an account without replacing any relationships.
UPDATE users
SET email = lower(trim(email)),
    auth_user_id = id::text
WHERE auth_user_id IS NULL;

ALTER TABLE users
    ALTER COLUMN auth_user_id SET NOT NULL,
    ADD CONSTRAINT users_auth_user_id_unique UNIQUE (auth_user_id),
    ADD CONSTRAINT users_username_unique UNIQUE (username);

CREATE UNIQUE INDEX users_email_normalized_unique ON users (lower(trim(email)));

-- Domain code and development seeds can continue inserting UUID users without
-- knowing about Better Auth's text identifier. Better Auth supplies its own
-- auth_user_id, while this trigger derives one for ordinary Friendminton rows.
CREATE FUNCTION set_default_auth_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.auth_user_id IS NULL OR NEW.auth_user_id = '' THEN
        NEW.auth_user_id := NEW.id::text;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_default_auth_user_id
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION set_default_auth_user_id();

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    token TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    user_id TEXT NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
    impersonated_by TEXT,
    active_organization_id TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(auth_user_id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at TIMESTAMPTZ,
    refresh_token_expires_at TIMESTAMPTZ,
    scope TEXT,
    password TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_id, account_id)
);

CREATE TABLE verifications (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A second PKCE challenge binds the native app that starts OAuth to the
-- one-time code exchange after the HTTPS Google callback.
CREATE TABLE auth_mobile_oauth_attempts (
    state_hash BYTEA PRIMARY KEY,
    code_challenge TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_mobile_codes (
    code_hash BYTEA PRIMARY KEY,
    session_token TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
    code_challenge TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_token ON sessions (token);
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX idx_accounts_user_id ON accounts (user_id);
CREATE INDEX idx_verifications_identifier ON verifications (identifier);
CREATE INDEX idx_auth_mobile_oauth_attempts_expires_at
    ON auth_mobile_oauth_attempts (expires_at);
CREATE INDEX idx_auth_mobile_codes_expires_at ON auth_mobile_codes (expires_at);
