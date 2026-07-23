ALTER TABLE badminton_groups
    ADD COLUMN location_label TEXT,
    ADD COLUMN google_place_id TEXT,
    ADD COLUMN latitude DOUBLE PRECISION,
    ADD COLUMN longitude DOUBLE PRECISION,
    ADD CONSTRAINT badminton_groups_coordinate_pair CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (
            latitude BETWEEN -90 AND 90
            AND longitude BETWEEN -180 AND 180
        )
    ),
    ADD COLUMN location GEOGRAPHY(POINT, 4326)
        GENERATED ALWAYS AS (
            CASE
                WHEN latitude IS NOT NULL AND longitude IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::GEOGRAPHY
                ELSE NULL
            END
        ) STORED;

CREATE INDEX idx_badminton_groups_location_gist
    ON badminton_groups USING GIST (location);
