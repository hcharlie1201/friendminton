CREATE TABLE gatherings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL
        CHECK (kind IN ('play', 'social', 'play_and_social')),
    visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'private')),
    join_policy TEXT NOT NULL DEFAULT 'open'
        CHECK (join_policy IN ('open', 'approval_required', 'invite_only', 'members_only')),
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    venue TEXT NOT NULL CHECK (char_length(btrim(venue)) BETWEEN 1 AND 200),
    city TEXT NOT NULL CHECK (char_length(btrim(city)) BETWEEN 1 AND 100),
    description TEXT CHECK (description IS NULL OR char_length(description) <= 5000),
    capacity INTEGER CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 1000),
    cost_per_person_cents INTEGER NOT NULL DEFAULT 0
        CHECK (cost_per_person_cents BETWEEN 0 AND 100000000),
    currency TEXT NOT NULL DEFAULT 'USD'
        CHECK (currency ~ '^[A-Z]{3}$'),
    skill_level TEXT
        CHECK (skill_level IS NULL OR skill_level IN (
            'beginner', 'intermediate', 'advanced', 'competitive'
        )),
    play_format TEXT
        CHECK (play_format IS NULL OR play_format IN (
            'open_play', 'doubles', 'singles', 'drills', 'coaching'
        )),
    court_count INTEGER CHECK (court_count IS NULL OR court_count BETWEEN 1 AND 50),
    social_tags TEXT[] NOT NULL DEFAULT '{}'
        CHECK (
            cardinality(social_tags) <= 5
            AND social_tags <@ ARRAY[
                'drinks', 'food', 'board_games', 'watch_party', 'gear_swap'
            ]::TEXT[]
        ),
    theme TEXT CHECK (theme IS NULL OR char_length(btrim(theme)) BETWEEN 1 AND 40),
    cover_image_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE gathering_participants (
    gathering_id UUID NOT NULL REFERENCES gatherings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL
        CHECK (status IN ('going', 'pending', 'invited')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (gathering_id, user_id)
);

CREATE INDEX idx_gatherings_discovery
    ON gatherings (visibility, city, kind, starts_at);

CREATE INDEX idx_gatherings_host_time
    ON gatherings (host_id, starts_at);

CREATE INDEX idx_gathering_participants_user
    ON gathering_participants (user_id, joined_at DESC);
