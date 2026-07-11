CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    city TEXT,
    skill_level TEXT NOT NULL DEFAULT 'beginner'
        CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'competitive')),
    bio TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    workout_type TEXT NOT NULL
        CHECK (workout_type IN ('match', 'drills', 'conditioning', 'lesson', 'open_play')),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    calories INTEGER CHECK (calories IS NULL OR calories >= 0),
    distance_meters INTEGER CHECK (distance_meters IS NULL OR distance_meters >= 0),
    notes TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
    body TEXT NOT NULL CHECK (char_length(body) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    venue TEXT NOT NULL,
    city TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    skill_level TEXT NOT NULL DEFAULT 'beginner'
        CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'competitive')),
    max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 32),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_invite_players (
    game_invite_id UUID NOT NULL REFERENCES game_invites(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (game_invite_id, user_id)
);

CREATE INDEX idx_users_discovery ON users (city, skill_level, created_at DESC);
CREATE INDEX idx_workouts_user_time ON workouts (user_id, occurred_at DESC);
CREATE INDEX idx_posts_feed ON posts (created_at DESC);
CREATE INDEX idx_game_invites_discovery ON game_invites (city, skill_level, starts_at);
