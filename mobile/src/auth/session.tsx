import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';

import type { User } from '../api/generated';

type SessionUser = Pick<User, 'id' | 'display_name' | 'email'>;
type SessionContextValue = {
  isLoading: boolean;
  signIn: (user: SessionUser) => Promise<void>;
  signOut: () => Promise<void>;
  user: SessionUser | null;
};

const sessionKey = 'friendminton.session.user';
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const stored = await SecureStore.getItemAsync(sessionKey);
        const nextUser = stored ? (JSON.parse(stored) as SessionUser) : null;
        if (isMounted) setUser(nextUser);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      isLoading,
      signIn: async (nextUser) => {
        await SecureStore.setItemAsync(sessionKey, JSON.stringify(nextUser));
        setUser(nextUser);
      },
      signOut: async () => {
        await SecureStore.deleteItemAsync(sessionKey);
        setUser(null);
      },
      user,
    }),
    [isLoading, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used within SessionProvider');
  }

  return value;
}
