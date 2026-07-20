BEGIN;

INSERT INTO users (id, email, display_name, city, skill_level, bio)
VALUES
    (
        'a1000000-0000-4000-8000-000000000001',
        'seed.ava@friendminton.local',
        'Ava Chen',
        'Oakland',
        'intermediate',
        'Doubles regular working on a sharper back-court game.'
    ),
    (
        'a1000000-0000-4000-8000-000000000002',
        'seed.marcus@friendminton.local',
        'Marcus Lee',
        'Berkeley',
        'advanced',
        'Early-morning drills, long rallies, and post-match coffee.'
    ),
    (
        'a1000000-0000-4000-8000-000000000003',
        'seed.nina@friendminton.local',
        'Nina Patel',
        'San Francisco',
        'competitive',
        'Tournament player who is always up for mixed doubles.'
    )
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    city = EXCLUDED.city,
    skill_level = EXCLUDED.skill_level,
    bio = EXCLUDED.bio,
    updated_at = now();

INSERT INTO workouts (
    id,
    user_id,
    title,
    workout_type,
    duration_minutes,
    duration_milliseconds,
    calories,
    distance_meters,
    notes,
    occurred_at
)
VALUES
    (
        'b1000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000001',
        'Lake Merritt doubles',
        'match',
        58,
        3465123,
        410,
        NULL,
        'Worked on taking the shuttle earlier at the net.',
        now() - interval '35 minutes'
    ),
    (
        'b1000000-0000-4000-8000-000000000002',
        'a1000000-0000-4000-8000-000000000002',
        'Footwork pattern session',
        'drills',
        43,
        2539876,
        285,
        NULL,
        'Six-corner shadow work and multi-shuttle defense.',
        now() - interval '2 hours 20 minutes'
    ),
    (
        'b1000000-0000-4000-8000-000000000003',
        'a1000000-0000-4000-8000-000000000003',
        'Tournament prep games',
        'match',
        77,
        4598456,
        590,
        NULL,
        'Three games focused on serve return and rotation.',
        now() - interval '5 hours 10 minutes'
    )
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    workout_type = EXCLUDED.workout_type,
    duration_minutes = EXCLUDED.duration_minutes,
    duration_milliseconds = EXCLUDED.duration_milliseconds,
    calories = EXCLUDED.calories,
    distance_meters = EXCLUDED.distance_meters,
    notes = EXCLUDED.notes;

INSERT INTO posts (
    id,
    user_id,
    workout_id,
    body,
    location,
    effort,
    image_urls,
    created_at
)
VALUES
    (
        'c1000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000001',
        'b1000000-0000-4000-8000-000000000001',
        'Unexpected court-side coach today. 🐦 Tight third game, but our rotations finally clicked.',
        'Lake Merritt, Oakland',
        8,
        ARRAY['posts/a1000000-0000-4000-8000-000000000001/seagull.jpg'],
        now() - interval '30 minutes'
    ),
    (
        'c1000000-0000-4000-8000-000000000002',
        'a1000000-0000-4000-8000-000000000002',
        'b1000000-0000-4000-8000-000000000002',
        'Footwork was chaotic at first, then the rhythm showed up. Swipe through the two-photo recap.',
        'Berkeley, CA',
        6,
        ARRAY[
            'posts/a1000000-0000-4000-8000-000000000002/color-squiggles.jpg',
            'posts/a1000000-0000-4000-8000-000000000002/seagull.jpg'
        ],
        now() - interval '2 hours 15 minutes'
    ),
    (
        'c1000000-0000-4000-8000-000000000003',
        'a1000000-0000-4000-8000-000000000003',
        'b1000000-0000-4000-8000-000000000003',
        'Tournament prep dump: fast exchanges, calmer serve returns, and one very judgmental spectator.',
        'San Francisco, CA',
        9,
        ARRAY[
            'posts/a1000000-0000-4000-8000-000000000003/seagull.jpg',
            'posts/a1000000-0000-4000-8000-000000000003/color-squiggles.jpg',
            'posts/a1000000-0000-4000-8000-000000000003/seagull-alt.jpg'
        ],
        now() - interval '5 hours'
    )
ON CONFLICT (id) DO UPDATE SET
    workout_id = EXCLUDED.workout_id,
    body = EXCLUDED.body,
    location = EXCLUDED.location,
    effort = EXCLUDED.effort,
    image_urls = EXCLUDED.image_urls;

COMMIT;
