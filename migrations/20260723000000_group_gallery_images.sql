ALTER TABLE badminton_groups
    ADD COLUMN image_keys TEXT[] NOT NULL DEFAULT '{}';

UPDATE badminton_groups
SET image_keys = ARRAY[cover_image_key]
WHERE cover_image_key IS NOT NULL;
