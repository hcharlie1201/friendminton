ALTER TABLE gatherings
    DROP CONSTRAINT gatherings_skill_level_check;

UPDATE gatherings
SET skill_level = CASE skill_level
    WHEN 'intermediate' THEN 'e_plus'
    WHEN 'advanced' THEN 'c'
    WHEN 'competitive' THEN 'a'
    ELSE skill_level
END;

ALTER TABLE gatherings
    ADD CONSTRAINT gatherings_skill_level_check
    CHECK (skill_level IS NULL OR skill_level IN (
        'beginner', 'e', 'e_plus', 'd', 'c', 'b', 'a'
    )),
    ADD COLUMN court_setup TEXT
        CHECK (court_setup IS NULL OR court_setup IN ('drop_in', 'reserved'));

UPDATE gatherings
SET court_setup = 'drop_in'
WHERE kind IN ('play', 'play_and_social');
