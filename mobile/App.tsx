import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from './src/screens/HomeScreen';

export default function App() {
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
        <HomeScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
