CREATE TABLE courts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_place_id TEXT UNIQUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
    address TEXT NOT NULL CHECK (char_length(btrim(address)) BETWEEN 1 AND 300),
    city TEXT NOT NULL CHECK (char_length(btrim(city)) BETWEEN 1 AND 100),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    environment TEXT NOT NULL DEFAULT 'indoor'
        CHECK (environment IN ('indoor', 'outdoor', 'mixed')),
    court_count INTEGER CHECK (court_count IS NULL OR court_count BETWEEN 1 AND 100),
    drop_in_available BOOLEAN NOT NULL DEFAULT false,
    amenities TEXT[] NOT NULL DEFAULT '{}'
        CHECK (amenities <@ ARRAY[
            'parking', 'showers', 'locker_rooms', 'pro_shop',
            'equipment_rental', 'water', 'seating'
        ]::TEXT[]),
    website_url TEXT CHECK (website_url IS NULL OR char_length(website_url) <= 500),
    reservation_url TEXT CHECK (reservation_url IS NULL OR char_length(reservation_url) <= 500),
    phone TEXT CHECK (phone IS NULL OR char_length(phone) <= 40),
    source TEXT NOT NULL DEFAULT 'community'
        CHECK (source IN ('community', 'google_places', 'admin')),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_courts_city_name ON courts (city, name);
CREATE INDEX idx_courts_coordinates ON courts (latitude, longitude);

ALTER TABLE gatherings
    ADD COLUMN court_id UUID REFERENCES courts(id) ON DELETE SET NULL,
    ADD COLUMN latitude DOUBLE PRECISION CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD COLUMN longitude DOUBLE PRECISION CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT gatherings_coordinates_pair_check
        CHECK ((latitude IS NULL) = (longitude IS NULL));

CREATE INDEX idx_gatherings_court ON gatherings (court_id, starts_at);
CREATE INDEX idx_gatherings_coordinates ON gatherings (latitude, longitude, starts_at);
