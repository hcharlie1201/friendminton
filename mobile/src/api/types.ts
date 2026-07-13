import type { components } from './generated/schema';

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'competitive';

export type WorkoutType = 'match' | 'drills' | 'conditioning' | 'lesson' | 'open_play';

export type User = components['schemas']['User'];
export type FeedPost = components['schemas']['FeedPost'];
export type Post = components['schemas']['Post'];
export type Workout = components['schemas']['Workout'];
export type GameInvite = components['schemas']['GameInvite'];

export type CreatePost = components['schemas']['CreatePost'];
export type CreateWorkout = components['schemas']['CreateWorkout'];
export type CreateGameInvite = components['schemas']['CreateGameInvite'];
