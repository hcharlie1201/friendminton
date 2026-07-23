ALTER TABLE badminton_groups
    DROP CONSTRAINT badminton_groups_coordinate_pair,
    ADD CONSTRAINT badminton_groups_coordinate_pair CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (
            latitude IS NOT NULL
            AND longitude IS NOT NULL
            AND latitude BETWEEN -90 AND 90
            AND longitude BETWEEN -180 AND 180
        )
    );
