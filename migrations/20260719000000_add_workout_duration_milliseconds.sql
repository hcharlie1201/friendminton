ALTER TABLE workouts
ADD COLUMN duration_milliseconds BIGINT;

UPDATE workouts
SET duration_milliseconds = duration_minutes::BIGINT * 60 * 1000;

ALTER TABLE workouts
ALTER COLUMN duration_milliseconds SET NOT NULL;

ALTER TABLE workouts
ADD CONSTRAINT workouts_duration_milliseconds_positive CHECK (duration_milliseconds > 0);
