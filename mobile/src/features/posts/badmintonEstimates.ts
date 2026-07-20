import type { FeedPost } from '../../api/generated';

export type BadmintonEstimate = {
  calories: number;
  caloriesAreEstimated: boolean;
  footworkLoad: number;
  predictedShotAccuracy: number;
  strokeVolume: number;
};

export function estimateBadmintonSession(post: FeedPost): BadmintonEstimate | null {
  const durationMilliseconds = post.workout_duration_milliseconds ?? 0;
  if (durationMilliseconds <= 0) return null;

  const minutes = durationMilliseconds / 60_000;
  const effort = clamp(post.effort ?? 5, 1, 10);
  const activityType = post.workout_type ?? 'match';
  const footworkLoad = clamp(
    Math.round(effort * 8 + Math.min(minutes, 60) / 6 + footworkBonus(activityType)),
    1,
    100,
  );
  const strokeVolume = roundToNearestTen(
    minutes * strokeRate(activityType) * (0.75 + effort * 0.05),
  );
  const predictedShotAccuracy = clamp(
    Math.round(
      skillConsistencyBaseline(post.user_skill_level)
      + consistencyActivityAdjustment(activityType)
      + Math.min(effort, 8)
      - Math.max(0, minutes - 50) * 0.12
      + stableVariation(post.id),
    ),
    35,
    92,
  );
  const caloriesAreEstimated = post.workout_calories == null;
  const calories = post.workout_calories ?? Math.round(minutes * (3.8 + effort * 0.65));

  return {
    calories,
    caloriesAreEstimated,
    footworkLoad,
    predictedShotAccuracy,
    strokeVolume,
  };
}

function footworkBonus(activityType: string) {
  switch (activityType) {
    case 'drills':
      return 15;
    case 'conditioning':
      return 12;
    case 'match':
      return 8;
    case 'lesson':
      return 6;
    default:
      return 5;
  }
}

function strokeRate(activityType: string) {
  switch (activityType) {
    case 'drills':
      return 18;
    case 'match':
      return 14;
    case 'lesson':
      return 12;
    case 'open_play':
      return 11;
    default:
      return 9;
  }
}

function skillConsistencyBaseline(skillLevel: string | undefined) {
  switch (skillLevel) {
    case 'beginner':
      return 46;
    case 'advanced':
      return 64;
    case 'competitive':
      return 69;
    case 'intermediate':
    default:
      return 56;
  }
}

function consistencyActivityAdjustment(activityType: string) {
  switch (activityType) {
    case 'drills':
      return 4;
    case 'lesson':
      return 3;
    case 'match':
      return 0;
    default:
      return 1;
  }
}

function stableVariation(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 997;
  }
  return (hash % 7) - 3;
}

function roundToNearestTen(value: number) {
  return Math.max(10, Math.round(value / 10) * 10);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
