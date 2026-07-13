import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  children: ReactNode;
  centered?: boolean;
};

export function Screen({ children, centered = false }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={[styles.keyboardView, centered && styles.centered]}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F7F4ED',
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
});
