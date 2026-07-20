ALTER TABLE gatherings
    DROP CONSTRAINT gatherings_play_format_check,
    ADD CONSTRAINT gatherings_play_format_check
        CHECK (play_format IS NULL OR play_format IN (
            'open_play', 'round_robin', 'doubles', 'singles', 'drills', 'coaching'
        ));

INSERT INTO courts (
    id, name, address, city, latitude, longitude, environment, court_count,
    drop_in_available, amenities, website_url, reservation_url, phone,
    source, verified_at
)
VALUES (
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
ON CONFLICT (id) DO NOTHING;
