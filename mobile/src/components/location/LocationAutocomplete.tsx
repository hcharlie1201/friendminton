import { Ionicons } from '@expo/vector-icons';
import { useQuery, type QueryFunctionContext } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getApiPlacesAutocomplete,
  getApiPlacesByPlaceId,
  type PlacePrediction,
} from '../../api/generated';
import { apiData, authHeaders } from '../../api/runtime';
import { useSession } from '../../auth/session';
import { errorMessage } from '../../common/errors';
import { TextField, colors, fonts } from '../ui';

export type SelectedLocation = {
  address: string;
  city: string | null;
  label: string;
  latitude: number;
  longitude: number;
  placeId: string;
};

type Props = {
  initialText?: string;
  onSelect: (location: SelectedLocation) => void;
  placeholder?: string;
  value: SelectedLocation | null;
};

type PlacesQueryKey = readonly ['place-autocomplete', string, string, string];

export function LocationAutocomplete({ initialText, onSelect, placeholder = 'Search for a court or address', value }: Props) {
  const autocomplete = useLocationAutocomplete(value, initialText, onSelect);
  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <Ionicons color={colors.primary} name="location-outline" size={20} />
        <TextField
          accessibilityLabel="Location"
          autoCapitalize="words"
          onChangeText={autocomplete.changeQuery}
          onFocus={autocomplete.focus}
          placeholder={placeholder}
          style={styles.input}
          value={autocomplete.query}
        />
        {autocomplete.isResolving && <ActivityIndicator color={colors.primary} size="small" />}
      </View>

      {autocomplete.showResults && (
        <View style={styles.results}>
          {autocomplete.isLoading && (
            <View style={styles.statusRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.statusText}>Finding locations…</Text>
            </View>
          )}
          {autocomplete.error && <Text style={styles.errorText}>{errorMessage(autocomplete.error)}</Text>}
          {autocomplete.predictions.map((prediction) => (
            <PredictionRow
              key={prediction.place_id}
              onSelect={autocomplete.selectPrediction}
              prediction={prediction}
            />
          ))}
          {autocomplete.predictions.length > 0 && (
            <Text accessibilityLabel="Powered by Google" style={styles.attribution}>powered by Google</Text>
          )}
        </View>
      )}
    </View>
  );
}

function PredictionRow({ onSelect, prediction }: {
  onSelect: (prediction: PlacePrediction) => void;
  prediction: PlacePrediction;
}) {
  const select = usePredictionSelection(onSelect, prediction);
  return (
    <Pressable accessibilityRole="button" onPress={select} style={styles.prediction}>
      <Ionicons color={colors.muted} name="location" size={18} />
      <View style={styles.predictionCopy}>
        <Text numberOfLines={1} style={styles.predictionTitle}>{prediction.primary_text}</Text>
        {prediction.secondary_text && (
          <Text numberOfLines={1} style={styles.predictionSubtitle}>{prediction.secondary_text}</Text>
        )}
      </View>
    </Pressable>
  );
}

function useLocationAutocomplete(value: SelectedLocation | null, initialText: string | undefined, onSelect: Props['onSelect']) {
  const { user } = useSession();
  const [query, setQuery] = useState(value?.label ?? initialText ?? '');
  const [sessionToken, setSessionToken] = useState(createSessionToken);
  const [showResults, setShowResults] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<unknown>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const predictionsQuery = useQuery({
    enabled: showResults && Boolean(user?.id) && debouncedQuery.length >= 3,
    queryFn: loadPlacePredictions,
    queryKey: ['place-autocomplete', debouncedQuery, sessionToken, user?.id ?? ''] satisfies PlacesQueryKey,
    retry: false,
    staleTime: 30_000,
  });
  const changeQuery = useCallback((next: string) => {
    setQuery(next);
    setResolveError(null);
    setShowResults(true);
  }, []);
  const focus = useCallback(() => setShowResults(true), []);
  const selectPrediction = useCallback(async (prediction: PlacePrediction) => {
    if (!user?.id || isResolving) return;
    setIsResolving(true);
    setResolveError(null);
    try {
      const place = await apiData(getApiPlacesByPlaceId({
        headers: authHeaders(user.id),
        path: { place_id: prediction.place_id },
        query: { session_token: sessionToken },
      }));
      const location: SelectedLocation = {
        address: place.formatted_address,
        city: place.city ?? null,
        label: prediction.primary_text,
        latitude: place.latitude,
        longitude: place.longitude,
        placeId: place.place_id,
      };
      onSelect(location);
      setQuery(prediction.full_text);
      setShowResults(false);
      setSessionToken(createSessionToken());
    } catch (error) {
      setResolveError(error);
    } finally {
      setIsResolving(false);
    }
  }, [isResolving, onSelect, sessionToken, user?.id]);

  return {
    changeQuery,
    error: resolveError ?? predictionsQuery.error,
    focus,
    isLoading: predictionsQuery.isFetching,
    isResolving,
    predictions: predictionsQuery.data ?? [],
    query,
    selectPrediction,
    showResults: showResults && debouncedQuery.length >= 3,
  };
}

function usePredictionSelection(onSelect: (prediction: PlacePrediction) => void, prediction: PlacePrediction) {
  return useCallback(() => onSelect(prediction), [onSelect, prediction]);
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(setDebounced, delay, value);
    return () => clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

async function loadPlacePredictions({ queryKey }: QueryFunctionContext<PlacesQueryKey>) {
  const [, input, sessionToken, userId] = queryKey;
  return apiData(getApiPlacesAutocomplete({
    headers: authHeaders(userId),
    query: { input, session_token: sessionToken },
  }));
}

function createSessionToken() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, uuidNibble);
}

function uuidNibble(character: string) {
  const random = Math.floor(Math.random() * 16);
  const value = character === 'x' ? random : (random & 0x3) | 0x8;
  return value.toString(16);
}

const styles = StyleSheet.create({
  container: { gap: 6, position: 'relative', zIndex: 10 },
  inputRow: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', paddingLeft: 12, paddingRight: 10 },
  input: { borderColor: 'transparent', flex: 1, paddingHorizontal: 9 },
  results: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  prediction: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 58, paddingHorizontal: 12, paddingVertical: 8 },
  predictionCopy: { flex: 1, gap: 2, minWidth: 0 },
  predictionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14, fontWeight: '700' },
  predictionSubtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12 },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 9, padding: 14 },
  statusText: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  errorText: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12, padding: 12 },
  attribution: { color: colors.muted, fontFamily: fonts.medium, fontSize: 10, paddingHorizontal: 12, paddingVertical: 7, textAlign: 'right' },
});
