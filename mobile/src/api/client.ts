import createClient from 'openapi-fetch';

import { apiBaseUrl, devUserId } from '../config';
import type { paths } from './generated/schema';
import type {
  CreateGameInvite,
  CreatePost,
  CreateWorkout,
  FeedPost,
  GameInvite,
  Post,
  SkillLevel,
  User,
  Workout,
} from './types';

type JsonError = {
  error?: string;
};

class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const client = createClient<paths>({
  baseUrl: apiBaseUrl,
});

function authHeaders(userId?: string) {
  const resolvedUserId = userId ?? devUserId;
  return resolvedUserId ? { 'x-user-id': resolvedUserId } : undefined;
}

function unwrap<T>({ data, error, response }: { data?: T; error?: JsonError; response: Response }) {
  if (error) {
    throw new ApiError(error.error ?? `Request failed with status ${response.status}`, response.status);
  }

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  return data as T;
}

export const api = {
  health: () => fetch(`${apiBaseUrl}/healthz`).then((response) => response.ok),

  async findPlayers(params: { city?: string; skillLevel?: SkillLevel }) {
    const result = await client.GET('/api/users', {
      params: {
        query: {
          city: params.city,
          skill_level: params.skillLevel,
        },
      },
    });

    return unwrap<User[]>(result);
  },

  async feed() {
    const result = await client.GET('/api/posts/feed');
    return unwrap<FeedPost[]>(result);
  },

  async createPost(payload: CreatePost, userId?: string) {
    const result = await client.POST('/api/posts', {
      body: payload,
      headers: authHeaders(userId),
    });

    return unwrap<Post>(result);
  },

  async createWorkout(payload: CreateWorkout, userId?: string) {
    const result = await client.POST('/api/workouts', {
      body: payload,
      headers: authHeaders(userId),
    });

    return unwrap<Workout>(result);
  },

  async findGameInvites(params: { city?: string; skillLevel?: SkillLevel }) {
    const result = await client.GET('/api/game-invites', {
      params: {
        query: {
          city: params.city,
          skill_level: params.skillLevel,
        },
      },
    });

    return unwrap<GameInvite[]>(result);
  },

  async createGameInvite(payload: CreateGameInvite, userId?: string) {
    const result = await client.POST('/api/game-invites', {
      body: payload,
      headers: authHeaders(userId),
    });

    return unwrap<GameInvite>(result);
  },
};
