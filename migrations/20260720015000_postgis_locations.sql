CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE courts
    ADD COLUMN location GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::GEOGRAPHY
        ) STORED;

CREATE INDEX idx_courts_location_gist ON courts USING GIST (location);

ALTER TABLE gatherings
    ADD COLUMN location GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            CASE
                WHEN latitude IS NOT NULL AND longitude IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::GEOGRAPHY
                ELSE NULL
            END
        ) STORED;

CREATE INDEX idx_gatherings_location_gist ON gatherings USING GIST (location);
