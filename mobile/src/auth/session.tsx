import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  getApiAuthSession,
  postApiAuthSignOut,
  type AuthenticatedSession,
  type User,
} from '../api/generated';
import { apiData, apiSuccess, setApiSessionToken } from '../api/runtime';
import { normalizeAppError } from '../common/errors';

export type SessionLocation = {
  city: string;
  latitude: number | null;
  longitude: number | null;
};

type SessionUser = Pick<User, 'id' | 'display_name' | 'email' | 'is_admin'> & Pick<Partial<User>, 'city'>;
type StoredSession = {
  discoveryLocation: SessionLocation | null;
  discoveryLocationEnabled: boolean;
  needsOnboarding: boolean;
  token: string;
  user: SessionUser;
};
type SessionContextValue = {
  clearSession: () => Promise<void>;
  completeOnboarding: (location: SessionLocation) => Promise<void>;
  discoveryLocation: SessionLocation | null;
  discoveryLocationEnabled: boolean;
  isLoading: boolean;
  needsOnboarding: boolean;
  restoreError: string | null;
  retryRestore: () => void;
  signIn: (session: AuthenticatedSession) => Promise<void>;
  signOut: () => Promise<void>;
  updateDiscoveryPreferences: (location: SessionLocation, locationEnabled: boolean) => Promise<void>;
  updateUser: (user: Pick<User, 'display_name' | 'city'>) => Promise<void>;
  user: SessionUser | null;
};
type RestoreResult = {
  error: string | null;
  session: StoredSession | null;
};

const sessionKey = 'friendminton.session.user';
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useStoredSession();

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

function useStoredSession(): SessionContextValue {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(true);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [storedSession, setStoredSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    let isMounted = true;

    void restorePersistedSession()
      .then((result) => {
        if (!isMounted) return;
        setStoredSession(result.session);
        setRestoreError(result.error);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!isMounted) return;
        setApiSessionToken(null);
        setStoredSession(null);
        setRestoreError(normalizeAppError(error).message);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [restoreAttempt]);

  const retryRestore = useCallback(() => {
    setIsLoading(true);
    setRestoreError(null);
    setRestoreAttempt((attempt) => attempt + 1);
  }, []);
  const signIn = useCallback(async (session: AuthenticatedSession) => {
    const nextSession = sessionFromAuthentication(session);
    setApiSessionToken(nextSession.token);
    try {
      await persistSession(nextSession);
      setStoredSession(nextSession);
      setRestoreError(null);
    } catch (error) {
      setApiSessionToken(null);
      throw error;
    }
  }, []);
  const clearSession = useCallback(async () => {
    setApiSessionToken(null);
    try {
      await SecureStore.deleteItemAsync(sessionKey);
    } finally {
      queryClient.clear();
      setStoredSession(null);
      setRestoreError(null);
    }
  }, [queryClient]);
  const signOut = useCallback(async () => {
    try {
      if (storedSession?.token) {
        await apiSuccess(postApiAuthSignOut());
      }
    } finally {
      await clearSession();
    }
  }, [clearSession, storedSession?.token]);
  const completeOnboarding = useCallback(async (location: SessionLocation) => {
    if (!storedSession) return;
    const nextSession: StoredSession = {
      ...storedSession,
      discoveryLocation: location,
      discoveryLocationEnabled: true,
      needsOnboarding: false,
    };
    await persistSession(nextSession);
    setStoredSession(nextSession);
  }, [storedSession]);
  const updateDiscoveryPreferences = useCallback(async (
    location: SessionLocation,
    locationEnabled: boolean,
  ) => {
    if (!storedSession) return;
    const nextSession = {
      ...storedSession,
      discoveryLocation: location,
      discoveryLocationEnabled: locationEnabled,
    };
    await persistSession(nextSession);
    setStoredSession(nextSession);
  }, [storedSession]);
  const updateUser = useCallback(async (user: Pick<User, 'display_name' | 'city'>) => {
    if (!storedSession) return;
    const nextSession = { ...storedSession, user: { ...storedSession.user, ...user } };
    await persistSession(nextSession);
    setStoredSession(nextSession);
  }, [storedSession]);
  const value = useMemo<SessionContextValue>(
    () => ({
      clearSession,
      completeOnboarding,
      discoveryLocation: storedSession?.discoveryLocation ?? null,
      discoveryLocationEnabled: storedSession?.discoveryLocationEnabled ?? true,
      isLoading,
      needsOnboarding: storedSession?.needsOnboarding ?? false,
      restoreError,
      retryRestore,
      signIn,
      signOut,
      updateDiscoveryPreferences,
      updateUser,
      user: storedSession?.user ?? null,
    }),
    [
      clearSession,
      completeOnboarding,
      isLoading,
      restoreError,
      retryRestore,
      signIn,
      signOut,
      storedSession,
      updateDiscoveryPreferences,
      updateUser,
    ],
  );

  return value;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used within SessionProvider');
  }

  return value;
}

async function restorePersistedSession(): Promise<RestoreResult> {
  const storedSession = await readStoredSession();
  if (!storedSession) {
    setApiSessionToken(null);
    return { error: null, session: null };
  }

  setApiSessionToken(storedSession.token);
  try {
    const user = await apiData(getApiAuthSession());
    const restoredSession = { ...storedSession, user };
    await persistSession(restoredSession);
    return { error: null, session: restoredSession };
  } catch (error) {
    const appError = normalizeAppError(error);
    if (appError.status === 401) {
      setApiSessionToken(null);
      await SecureStore.deleteItemAsync(sessionKey);
      return { error: null, session: null };
    }
    return { error: appError.message, session: storedSession };
  }
}

async function readStoredSession() {
  const stored = await SecureStore.getItemAsync(sessionKey);
  if (!stored) return null;

  try {
    const session = normalizeStoredSession(JSON.parse(stored));
    if (session) return session;
  } catch {
    // Invalid or legacy identity-only data is cleared below.
  }

  await SecureStore.deleteItemAsync(sessionKey);
  return null;
}

function normalizeStoredSession(value: unknown): StoredSession | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StoredSession>;
  if (
    typeof candidate.token !== 'string'
    || !candidate.token
    || !candidate.user
    || typeof candidate.user.id !== 'string'
    || typeof candidate.user.email !== 'string'
    || typeof candidate.user.display_name !== 'string'
  ) {
    return null;
  }

  return {
    discoveryLocation: normalizeSessionLocation(candidate.discoveryLocation),
    discoveryLocationEnabled: candidate.discoveryLocationEnabled !== false,
    needsOnboarding: Boolean(candidate.needsOnboarding),
    token: candidate.token,
    user: { ...candidate.user, is_admin: candidate.user.is_admin === true },
  };
}

function normalizeSessionLocation(value: unknown): SessionLocation | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SessionLocation>;
  if (typeof candidate.city !== 'string' || !candidate.city) return null;
  return {
    city: candidate.city,
    latitude: typeof candidate.latitude === 'number' ? candidate.latitude : null,
    longitude: typeof candidate.longitude === 'number' ? candidate.longitude : null,
  };
}

function sessionFromAuthentication(session: AuthenticatedSession): StoredSession {
  const city = session.user.city?.trim() || null;
  return {
    discoveryLocation: city ? { city, latitude: null, longitude: null } : null,
    discoveryLocationEnabled: true,
    needsOnboarding: !city,
    token: session.token,
    user: session.user,
  };
}

async function persistSession(session: StoredSession) {
  await SecureStore.setItemAsync(sessionKey, JSON.stringify(session));
}
