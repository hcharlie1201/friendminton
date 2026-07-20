CREATE TABLE badminton_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 3000),
    city TEXT NOT NULL CHECK (char_length(btrim(city)) BETWEEN 1 AND 100),
    visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'private')),
    join_policy TEXT NOT NULL DEFAULT 'open'
        CHECK (join_policy IN ('open', 'approval_required', 'invite_only')),
    primary_court_id UUID REFERENCES courts(id) ON DELETE SET NULL,
    goal_tags TEXT[] NOT NULL DEFAULT '{}'
        CHECK (goal_tags <@ ARRAY[
            'fitness', 'social', 'improvement', 'competitive', 'consistent_play'
        ]::TEXT[]),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE badminton_group_members (
    group_id UUID NOT NULL REFERENCES badminton_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'member')),
    status TEXT NOT NULL DEFAULT 'member'
        CHECK (status IN ('member', 'pending', 'invited')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_badminton_groups_discovery
    ON badminton_groups (visibility, city, created_at DESC);
CREATE INDEX idx_badminton_groups_court
    ON badminton_groups (primary_court_id, created_at DESC);
CREATE INDEX idx_badminton_group_members_user
    ON badminton_group_members (user_id, status, joined_at DESC);

ALTER TABLE gatherings
    ADD COLUMN group_id UUID REFERENCES badminton_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_gatherings_group ON gatherings (group_id, starts_at);
