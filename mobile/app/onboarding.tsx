import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession, type SessionLocation } from '../src/auth/session';
import { errorMessage } from '../src/common/errors';
import { LocationAutocomplete, type SelectedLocation } from '../src/components/location';
import { Button, Screen, colors, fonts } from '../src/components/ui';
import { getCurrentLocation, LocationPermissionError } from '../src/features/location/currentCity';

type Feature = {
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
};

const features: Feature[] = [
  {
    body: 'Discover nearby games, courts, and players who match your level.',
    icon: 'search',
    title: 'Find your next rally',
  },
  {
    body: 'Create gatherings, join local groups, and turn a free evening into court time.',
    icon: 'people',
    title: 'Play with your people',
  },
  {
    body: 'Share sessions and celebrate the small wins with your badminton community.',
    icon: 'sparkles',
    title: 'Keep the fun going',
  },
];

export default function OnboardingScreen() {
  const onboarding = useOnboarding();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Progress current={onboarding.page} />
        {onboarding.page === 0 ? (
          <WelcomePage onContinue={onboarding.next} />
        ) : (
          <LocationPage
            isCompleting={onboarding.isCompleting}
            isLocating={onboarding.isLocating}
            location={onboarding.location}
            onLocationSelect={onboarding.selectLocation}
            onSubmit={onboarding.finish}
            onUseCurrentLocation={onboarding.useCurrentLocation}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function WelcomePage({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.page}>
      <View style={styles.heroIcon}>
        <Ionicons color={colors.primaryStrong} name="tennisball" size={42} />
      </View>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>WELCOME TO FRIENDMINTON</Text>
        <Text style={styles.title}>More rallies, fewer lonely courts.</Text>
        <Text style={styles.subtitle}>
          Everything you need to find games and grow your local badminton circle.
        </Text>
      </View>
      <View style={styles.features}>
        {features.map((feature) => <FeatureRow feature={feature} key={feature.title} />)}
      </View>
      <Button icon="arrow-forward" onPress={onContinue}>Show me around</Button>
    </View>
  );
}

function FeatureRow({ feature }: { feature: Feature }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons color={colors.playAccentStrong} name={feature.icon} size={22} />
      </View>
      <View style={styles.featureCopy}>
        <Text style={styles.featureTitle}>{feature.title}</Text>
        <Text style={styles.featureBody}>{feature.body}</Text>
      </View>
    </View>
  );
}

function LocationPage({
  isCompleting,
  isLocating,
  location,
  onLocationSelect,
  onSubmit,
  onUseCurrentLocation,
}: {
  isCompleting: boolean;
  isLocating: boolean;
  location: SessionLocation | null;
  onLocationSelect: (location: SelectedLocation) => void;
  onSubmit: () => void;
  onUseCurrentLocation: () => void;
}) {
  return (
    <View style={styles.page}>
      <View style={styles.heroIcon}>
        <Ionicons color={colors.primaryStrong} name="location" size={40} />
      </View>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>YOUR HOME COURT AREA</Text>
        <Text style={styles.title}>What’s near you?</Text>
        <Text style={styles.subtitle}>
          We use this to surface nearby games, groups, courts, and players.
        </Text>
      </View>
      <View style={styles.locationCard}>
        <Button
          icon="navigate"
          loading={isLocating}
          onPress={onUseCurrentLocation}
          variant="secondary"
        >
          Use my current location
        </Button>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>or type an address</Text>
          <View style={styles.dividerLine} />
        </View>
        <LocationAutocomplete
          initialText={location?.city}
          onSelect={onLocationSelect}
          placeholder="City, neighborhood, or address"
          value={null}
        />
        {location && (
          <View style={styles.selectedLocation}>
            <Ionicons color={colors.success} name="checkmark-circle" size={20} />
            <Text style={styles.selectedLocationText}>{location.city}</Text>
          </View>
        )}
      </View>
      <Text style={styles.privacy}>
        Your precise location is only used to choose a nearby discovery area.
      </Text>
      <Button disabled={!location} icon="sparkles" loading={isCompleting} onPress={onSubmit}>
        Start discovering
      </Button>
    </View>
  );
}

function Progress({ current }: { current: number }) {
  return (
    <View accessibilityLabel={`Onboarding step ${current + 1} of 2`} style={styles.progress}>
      <View style={[styles.progressDot, styles.progressDotActive]} />
      <View style={[styles.progressDot, current === 1 && styles.progressDotActive]} />
    </View>
  );
}

function useOnboarding() {
  const { completeOnboarding } = useSession();
  const [page, setPage] = useState(0);
  const [location, setLocation] = useState<SessionLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const next = useCallback(() => setPage(1), []);
  const selectLocation = useCallback((selected: SelectedLocation) => {
    setLocation({
      city: selected.city ?? selected.label,
      latitude: selected.latitude,
      longitude: selected.longitude,
    });
  }, []);
  const useCurrentLocation = useCallback(() => {
    void discoverCurrentLocation(setLocation, setIsLocating);
  }, []);
  const finish = useCallback(() => {
    if (location) {
      void finishOnboarding(location, completeOnboarding, setIsCompleting);
    }
  }, [completeOnboarding, location]);

  return {
    finish,
    isCompleting,
    isLocating,
    location,
    next,
    page,
    selectLocation,
    useCurrentLocation,
  };
}

async function discoverCurrentLocation(
  setLocation: (location: SessionLocation) => void,
  setIsLocating: (isLocating: boolean) => void,
) {
  setIsLocating(true);
  try {
    setLocation(await getCurrentLocation());
  } catch (error) {
    const message = error instanceof LocationPermissionError
      ? 'Location access was not granted. You can search for your address instead.'
      : errorMessage(error);
    Alert.alert('Couldn’t find your location', message);
  } finally {
    setIsLocating(false);
  }
}

async function finishOnboarding(
  location: SessionLocation,
  completeOnboarding: (location: SessionLocation) => Promise<void>,
  setIsCompleting: (isCompleting: boolean) => void,
) {
  setIsCompleting(true);
  try {
    await completeOnboarding(location);
  } catch (error) {
    Alert.alert('Couldn’t finish setup', errorMessage(error));
    setIsCompleting(false);
  }
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  progress: {
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginBottom: 22,
  },
  progressDot: {
    backgroundColor: colors.border,
    borderRadius: 4,
    height: 7,
    width: 28,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  page: {
    flex: 1,
    gap: 24,
    justifyContent: 'center',
  },
  heroIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primarySurface,
    borderColor: colors.borderStrong,
    borderRadius: 34,
    borderWidth: 1,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  heading: {
    gap: 7,
  },
  eyebrow: {
    color: colors.primaryStrong,
    fontFamily: fonts.extraBold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 31,
    fontWeight: '900',
    lineHeight: 36,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  features: {
    gap: 13,
  },
  feature: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    padding: 14,
  },
  featureIcon: {
    alignItems: 'center',
    backgroundColor: colors.playAccentSurface,
    borderRadius: 13,
    height: 45,
    justifyContent: 'center',
    width: 45,
  },
  featureCopy: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 15,
    fontWeight: '900',
  },
  featureBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  locationCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  dividerLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    color: colors.textSubtle,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  selectedLocation: {
    alignItems: 'center',
    backgroundColor: colors.successSurface,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  selectedLocationText: {
    color: colors.success,
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 13,
    fontWeight: '700',
  },
  privacy: {
    color: colors.textSubtle,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
