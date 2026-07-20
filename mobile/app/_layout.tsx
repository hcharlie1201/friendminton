import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider, useSession } from '../src/auth/session';
import { colors, fonts } from '../src/components/ui';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    [fonts.regular]: require('@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf'),
    [fonts.medium]: require('@expo-google-fonts/noto-sans/500Medium/NotoSans_500Medium.ttf'),
    [fonts.semibold]: require('@expo-google-fonts/noto-sans/600SemiBold/NotoSans_600SemiBold.ttf'),
    [fonts.bold]: require('@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf'),
    [fonts.extraBold]: require('@expo-google-fonts/noto-sans/800ExtraBold/NotoSans_800ExtraBold.ttf'),
    [fonts.black]: require('@expo-google-fonts/noto-sans/900Black/NotoSans_900Black.ttf'),
  });
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

  useEffect(() => {
    if (fontsLoaded) {
      applyDefaultTextFont();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <LoadingScreen />;
  }

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
    return <LoadingScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(user)}>
        <Stack.Screen name="index" />
        <Stack.Screen name="posts/[postId]" />
      </Stack.Protected>
    </Stack>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function applyDefaultTextFont() {
  const TextWithDefaults = Text as typeof Text & {
    defaultProps?: {
      style?: unknown;
    };
  };

  TextWithDefaults.defaultProps = TextWithDefaults.defaultProps ?? {};
  TextWithDefaults.defaultProps.style = [TextWithDefaults.defaultProps.style, { fontFamily: fonts.regular }];
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
