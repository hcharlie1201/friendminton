CREATE TABLE group_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES badminton_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_message_id UUID NOT NULL,
    body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (group_id, user_id, client_message_id)
);

CREATE TABLE group_message_reactions (
    message_id UUID NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL CHECK (emoji IN ('👍', '❤️', '🔥', '👏', '😂')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE group_conversation_reads (
    group_id UUID NOT NULL REFERENCES badminton_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

ALTER TABLE moderation_reports DROP CONSTRAINT moderation_reports_target_type_check;
ALTER TABLE moderation_reports ADD CONSTRAINT moderation_reports_target_type_check
    CHECK (target_type IN ('user', 'post', 'group_message'));

CREATE INDEX idx_group_messages_history
    ON group_messages (group_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_group_message_reactions_message
    ON group_message_reactions (message_id, emoji);
