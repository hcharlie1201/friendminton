import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, memo, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCurrentCity, LocationPermissionError } from '../../features/location/currentCity';
import { Button, colors, fonts, TextField } from '../ui';
import { SkillLevelPicker } from './SkillLevelPicker';
import type { DiscoveryPreferences, SkillLevel } from './types';

type Props = DiscoveryPreferences & {
  onApply: (preferences: DiscoveryPreferences) => void;
  onClose: () => void;
  visible: boolean;
};

const MINIMUM_SHEET_BOTTOM_PADDING = 16;

export const DiscoveryFilterSheet = memo(function DiscoveryFilterSheet({
  city,
  onApply,
  onClose,
  skillLevel,
  visible,
}: Props) {
  const insets = useSafeAreaInsets();
  const filter = useDiscoveryFilterSheet({ city, onApply, skillLevel, visible });

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View accessibilityViewIsModal style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close discovery filters"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetPosition}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, MINIMUM_SHEET_BOTTOM_PADDING) }]}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Pressable
                accessibilityLabel="Close discovery filters"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
              >
                <Ionicons color={colors.ink} name="close" size={27} />
              </Pressable>
              <Text accessibilityRole="header" style={styles.title}>
                Discover filters
              </Text>
              <Pressable
                accessibilityLabel="Reset discovery filters"
                accessibilityRole="button"
                hitSlop={8}
                onPress={filter.reset}
              >
                <Text style={styles.resetLabel}>Reset</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              style={styles.body}
            >
              <FilterSection description="Find people who play around this city." title="Location">
                <TextField
                  accessibilityLabel="Discovery city"
                  autoCapitalize="words"
                  onChangeText={filter.setDraftCity}
                  placeholder="City"
                  value={filter.draftCity}
                />
                <Button
                  icon="navigate-outline"
                  loading={filter.isLocating}
                  onPress={filter.useCurrentLocation}
                  size="compact"
                  variant="secondary"
                >
                  Use current location
                </Button>
              </FilterSection>

              <FilterSection description="Choose the pace that feels right for you." title="Playing level">
                <SkillLevelPicker onChange={filter.setDraftSkillLevel} value={filter.draftSkillLevel} />
              </FilterSection>
            </ScrollView>

            <Button icon="checkmark" onPress={filter.apply}>
              Show players
            </Button>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
});

function useDiscoveryFilterSheet({ city, onApply, skillLevel, visible }: Omit<Props, 'onClose'>) {
  const [isLocating, setIsLocating] = useState(false);
  const [draftCity, setDraftCity] = useState(city);
  const [draftSkillLevel, setDraftSkillLevel] = useState<SkillLevel | null>(skillLevel);

  useEffect(() => {
    if (visible) {
      setDraftCity(city);
      setDraftSkillLevel(skillLevel);
    }
  }, [city, skillLevel, visible]);

  const reset = useCallback(() => {
    setDraftCity(city);
    setDraftSkillLevel(null);
  }, [city]);

  const apply = useCallback(() => {
    const normalizedCity = draftCity.trim();
    if (!normalizedCity) {
      Alert.alert('Add a location', 'Choose a city so we know where to find players.');
      return;
    }

    onApply({ city: normalizedCity, skillLevel: draftSkillLevel });
  }, [draftCity, draftSkillLevel, onApply]);

  const useCurrentLocation = useCallback(async () => {
    setIsLocating(true);
    try {
      setDraftCity(await getCurrentCity());
    } catch (error) {
      showLocationError(error);
    } finally {
      setIsLocating(false);
    }
  }, []);

  return {
    apply,
    draftCity,
    draftSkillLevel,
    isLocating,
    reset,
    setDraftCity,
    setDraftSkillLevel,
    useCurrentLocation,
  };
}

function FilterSection({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <Text style={styles.sectionHelp}>{description}</Text>
      {children}
    </View>
  );
}

function showLocationError(error: unknown) {
  const message =
    error instanceof LocationPermissionError
      ? 'Allow location access to use your current city.'
      : error instanceof Error
        ? error.message
        : 'Could not read your current location.';
  Alert.alert('Location unavailable', message);
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetPosition: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    gap: 18,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    height: 4,
    width: 38,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.ink,
    fontFamily: fonts.black,
    fontSize: 19,
    fontWeight: '900',
  },
  resetLabel: {
    color: colors.primaryDark,
    fontFamily: fonts.bold,
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    gap: 20,
    paddingBottom: 4,
  },
  section: {
    gap: 9,
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fonts.black,
    fontSize: 17,
    fontWeight: '900',
  },
  sectionHelp: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
});
