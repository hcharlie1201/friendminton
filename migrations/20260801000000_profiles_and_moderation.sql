ALTER TABLE users
    ADD COLUMN avatar_key TEXT,
    ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE posts
    ADD COLUMN moderated_at TIMESTAMPTZ;

CREATE TABLE user_blocks (
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE TABLE moderation_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('user', 'post')),
    target_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('harassment', 'spam', 'hate', 'sexual_content', 'violence', 'other')),
    details TEXT CHECK (details IS NULL OR char_length(details) <= 1000),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    resolution_note TEXT CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 1000),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (reporter_id, target_type, target_id)
);

CREATE TABLE moderation_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    report_id UUID REFERENCES moderation_reports(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('resolved', 'dismissed', 'content_removed')),
    target_type TEXT NOT NULL,
    target_id UUID NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_blocks_blocked ON user_blocks (blocked_id, blocker_id);
CREATE INDEX idx_moderation_reports_status_created ON moderation_reports (status, created_at);
CREATE INDEX idx_moderation_audit_created ON moderation_audit_log (created_at DESC);
