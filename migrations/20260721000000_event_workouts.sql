ALTER TABLE workouts
    ADD COLUMN gathering_id UUID REFERENCES gatherings(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_workouts_user_gathering
    ON workouts (user_id, gathering_id)
    WHERE gathering_id IS NOT NULL;

CREATE INDEX idx_workouts_gathering ON workouts (gathering_id);
