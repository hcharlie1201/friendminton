CREATE TABLE auth_apple_pending_sign_ins (
    token_hash BYTEA PRIMARY KEY,
    apple_subject TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    id_token TEXT NOT NULL,
    access_token_expires_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX auth_apple_pending_sign_ins_subject_idx
    ON auth_apple_pending_sign_ins (apple_subject);

CREATE INDEX auth_apple_pending_sign_ins_expires_at_idx
    ON auth_apple_pending_sign_ins (expires_at);
