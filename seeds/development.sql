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

-- Oakland launch-city discovery set: enough variety to exercise category
-- search, location filtering, carousels, and cursor pagination locally.
INSERT INTO courts (
    id, name, address, city, latitude, longitude, environment, court_count,
    drop_in_available, amenities, website_url, reservation_url, phone,
    source, verified_at
)
VALUES
    (
        'd1000000-0000-4000-8000-000000000001',
        'East Oakland Sports Center',
        '9161 Edes Avenue, Oakland, CA 94603',
        'Oakland',
        37.7386,
        -122.1765,
        'indoor',
        4,
        true,
        ARRAY['parking', 'water', 'seating']::TEXT[],
        NULL,
        NULL,
        NULL,
        'admin',
        now()
    ),
    (
        'd1000000-0000-4000-8000-000000000002',
        'Lincoln Square Park Courts',
        '261 11th Street, Oakland, CA 94607',
        'Oakland',
        37.8005,
        -122.2667,
        'outdoor',
        3,
        true,
        ARRAY['water', 'seating']::TEXT[],
        NULL,
        NULL,
        NULL,
        'admin',
        now()
    ),
    (
        'd1000000-0000-4000-8000-000000000003',
        'Mosswood Recreation Center',
        '3612 Webster Street, Oakland, CA 94609',
        'Oakland',
        37.8232,
        -122.2613,
        'indoor',
        3,
        true,
        ARRAY['parking', 'water']::TEXT[],
        NULL,
        NULL,
        NULL,
        'admin',
        now()
    ),
    (
        '42f2ccba-a80a-4a15-935d-f99d5b7c1a11',
        'Pinnacle Badminton Center',
        '4230 Hubbard Street, Emeryville, CA 94608',
        'Emeryville',
        37.8314577,
        -122.2891787,
        'indoor',
        8,
        true,
        ARRAY['pro_shop', 'equipment_rental']::TEXT[],
        'https://www.pinnaclebadminton.com/',
        'https://app.courtreserve.com/',
        '(510) 879-7931',
        'admin',
        now()
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    environment = EXCLUDED.environment,
    court_count = EXCLUDED.court_count,
    drop_in_available = EXCLUDED.drop_in_available,
    amenities = EXCLUDED.amenities,
    verified_at = EXCLUDED.verified_at,
    updated_at = now();

INSERT INTO badminton_groups (
    id, owner_id, name, description, city, location_label, latitude, longitude,
    visibility, join_policy, primary_court_id, goal_tags, image_keys, cover_image_key
)
VALUES
    (
        'e1000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000001',
        'Oakland Rally Club',
        'Friendly weeknight doubles and a welcoming first game for newer East Bay players.',
        'Oakland',
        'Lake Merritt',
        37.8012,
        -122.2583,
        'public',
        'open',
        'd1000000-0000-4000-8000-000000000002',
        ARRAY['social', 'consistent_play']::TEXT[],
        ARRAY[]::TEXT[],
        NULL
    ),
    (
        'e1000000-0000-4000-8000-000000000002',
        'a1000000-0000-4000-8000-000000000002',
        'East Bay Shuttle Lab',
        'Structured drills, footwork sessions, and patient match review for improving players.',
        'Oakland',
        'Mosswood',
        37.8232,
        -122.2613,
        'public',
        'open',
        'd1000000-0000-4000-8000-000000000003',
        ARRAY['improvement', 'fitness']::TEXT[],
        ARRAY[]::TEXT[],
        NULL
    ),
    (
        'e1000000-0000-4000-8000-000000000003',
        'a1000000-0000-4000-8000-000000000003',
        'Town Tournament Crew',
        'Competitive doubles practice and tournament preparation around Oakland and Emeryville.',
        'Oakland',
        'North Oakland',
        37.8315,
        -122.2892,
        'public',
        'open',
        '42f2ccba-a80a-4a15-935d-f99d5b7c1a11',
        ARRAY['competitive', 'consistent_play']::TEXT[],
        ARRAY[]::TEXT[],
        NULL
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    city = EXCLUDED.city,
    location_label = EXCLUDED.location_label,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    primary_court_id = EXCLUDED.primary_court_id,
    goal_tags = EXCLUDED.goal_tags,
    updated_at = now();

INSERT INTO badminton_group_members (group_id, user_id, role, status)
VALUES
    ('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner', 'member'),
    ('e1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'member', 'member'),
    ('e1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'owner', 'member'),
    ('e1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'member', 'member'),
    ('e1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'owner', 'member')
ON CONFLICT (group_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status;

INSERT INTO gatherings (
    id, host_id, group_id, kind, visibility, join_policy, title, starts_at,
    ends_at, venue, city, court_id, latitude, longitude, description, capacity,
    cost_per_person_cents, currency, skill_level, skill_level_max, play_format,
    court_setup, court_count, social_tags, theme
)
VALUES
    (
        'f1000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000001',
        'e1000000-0000-4000-8000-000000000001',
        'play',
        'public',
        'open',
        'Lake Merritt beginner rally',
        date_trunc('day', now()) + interval '1 day 18 hours',
        date_trunc('day', now()) + interval '1 day 20 hours',
        'Lincoln Square Park Courts',
        'Oakland',
        'd1000000-0000-4000-8000-000000000002',
        37.8005,
        -122.2667,
        'Relaxed doubles with rotation help and spare rackets.',
        12,
        0,
        'USD',
        'beginner',
        'e',
        'doubles',
        'drop_in',
        3,
        ARRAY[]::TEXT[],
        'friendly'
    ),
    (
        'f1000000-0000-4000-8000-000000000002',
        'a1000000-0000-4000-8000-000000000002',
        'e1000000-0000-4000-8000-000000000002',
        'play',
        'public',
        'open',
        'Mosswood footwork lab',
        date_trunc('day', now()) + interval '2 days 7 hours',
        date_trunc('day', now()) + interval '2 days 8 hours 30 minutes',
        'Mosswood Recreation Center',
        'Oakland',
        'd1000000-0000-4000-8000-000000000003',
        37.8232,
        -122.2613,
        'Six-corner movement, multi-shuttle defense, then conditioned games.',
        10,
        500,
        'USD',
        'e_plus',
        'd',
        'drills',
        'reserved',
        3,
        ARRAY[]::TEXT[],
        'training'
    ),
    (
        'f1000000-0000-4000-8000-000000000003',
        'a1000000-0000-4000-8000-000000000003',
        'e1000000-0000-4000-8000-000000000003',
        'play',
        'public',
        'open',
        'Town competitive doubles',
        date_trunc('day', now()) + interval '3 days 19 hours',
        date_trunc('day', now()) + interval '3 days 22 hours',
        'Pinnacle Badminton Center',
        'Emeryville',
        '42f2ccba-a80a-4a15-935d-f99d5b7c1a11',
        37.8314577,
        -122.2891787,
        'Fast rotation games for tournament-level pairs.',
        16,
        1800,
        'USD',
        'c',
        'a',
        'doubles',
        'reserved',
        4,
        ARRAY[]::TEXT[],
        'competitive'
    ),
    (
        'f1000000-0000-4000-8000-000000000004',
        'a1000000-0000-4000-8000-000000000001',
        NULL,
        'play_and_social',
        'public',
        'open',
        'Friday rally and dumplings',
        date_trunc('day', now()) + interval '4 days 18 hours',
        date_trunc('day', now()) + interval '4 days 21 hours',
        'East Oakland Sports Center',
        'Oakland',
        'd1000000-0000-4000-8000-000000000001',
        37.7386,
        -122.1765,
        'Open play followed by dumplings nearby.',
        20,
        800,
        'USD',
        'e',
        'c',
        'open_play',
        'reserved',
        4,
        ARRAY['food']::TEXT[],
        'food'
    ),
    (
        'f1000000-0000-4000-8000-000000000005',
        'a1000000-0000-4000-8000-000000000002',
        NULL,
        'social',
        'public',
        'open',
        'East Bay gear swap',
        date_trunc('day', now()) + interval '5 days 14 hours',
        date_trunc('day', now()) + interval '5 days 16 hours',
        'Lake Merritt Pergola',
        'Oakland',
        NULL,
        37.8076,
        -122.2590,
        'Trade extra rackets and compare string setups over coffee.',
        30,
        0,
        'USD',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        ARRAY['gear_swap', 'food']::TEXT[],
        'community'
    ),
    (
        'f1000000-0000-4000-8000-000000000006',
        'a1000000-0000-4000-8000-000000000003',
        NULL,
        'play',
        'public',
        'open',
        'Sunday singles ladder',
        date_trunc('day', now()) + interval '6 days 10 hours',
        date_trunc('day', now()) + interval '6 days 13 hours',
        'Pinnacle Badminton Center',
        'Emeryville',
        '42f2ccba-a80a-4a15-935d-f99d5b7c1a11',
        37.8314577,
        -122.2891787,
        'Timed singles rounds with a simple moving ladder.',
        14,
        1600,
        'USD',
        'd',
        'a',
        'singles',
        'reserved',
        4,
        ARRAY[]::TEXT[],
        'ladder'
    )
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    venue = EXCLUDED.venue,
    city = EXCLUDED.city,
    court_id = EXCLUDED.court_id,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    description = EXCLUDED.description,
    capacity = EXCLUDED.capacity,
    cost_per_person_cents = EXCLUDED.cost_per_person_cents,
    skill_level = EXCLUDED.skill_level,
    skill_level_max = EXCLUDED.skill_level_max,
    updated_at = now();

INSERT INTO gathering_participants (gathering_id, user_id, status)
VALUES
    ('f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'going'),
    ('f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'going'),
    ('f1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'going'),
    ('f1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'going'),
    ('f1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'going'),
    ('f1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002', 'going'),
    ('f1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000003', 'going')
ON CONFLICT (gathering_id, user_id) DO UPDATE SET status = EXCLUDED.status;

COMMIT;
