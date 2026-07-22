CREATE UNIQUE INDEX idx_posts_workout
    ON posts (workout_id)
    WHERE workout_id IS NOT NULL;
