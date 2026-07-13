import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '../src/auth/session';

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ProtectedRoutes />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function ProtectedRoutes() {
  const { isLoading, user } = useSession();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#143D33" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(user)}>
        <Stack.Screen name="index" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: '#F7F4ED',
    flex: 1,
    justifyContent: 'center',
  },
});
