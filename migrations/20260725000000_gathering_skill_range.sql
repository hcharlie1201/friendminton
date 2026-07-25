ALTER TABLE gatherings
    ADD COLUMN skill_level_max TEXT
        CHECK (skill_level_max IS NULL OR skill_level_max IN (
            'beginner', 'e', 'e_plus', 'd', 'c', 'b', 'a'
        ));

UPDATE gatherings
SET skill_level_max = skill_level
WHERE skill_level IS NOT NULL;

ALTER TABLE gatherings
    ADD CONSTRAINT gatherings_skill_range_check
    CHECK (
        (skill_level IS NULL AND skill_level_max IS NULL)
        OR (
            skill_level IS NOT NULL
            AND skill_level_max IS NOT NULL
            AND array_position(
                ARRAY['beginner', 'e', 'e_plus', 'd', 'c', 'b', 'a']::TEXT[],
                skill_level
            ) <= array_position(
                ARRAY['beginner', 'e', 'e_plus', 'd', 'c', 'b', 'a']::TEXT[],
                skill_level_max
            )
        )
    );
