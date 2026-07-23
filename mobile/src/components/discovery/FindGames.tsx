import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import type { Court, Gathering } from '../../api/generated';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, type Provider, type Region } from 'react-native-maps';

import {
  activeGameFilterCount,
  applyQuickFilter,
  defaultGameDiscoveryFilters,
  filterGames,
  quickFilterFor,
  type GameDateFilter,
  type GameDiscoveryFilters,
  type GameQuickFilter,
  type GameResultsLayout,
} from '../../features/gatherings/gameDiscovery';
import { useCourtDiscovery } from '../../features/courts/useCourtDiscovery';
import { colors, fonts } from '../ui';
import { CourtResults } from './CourtResults';
import { DiscoveryResultTabs, type DiscoveryResultType } from './DiscoveryResultTabs';
import { GameDateStrip, GameQuickFilterStrip } from './GameDiscoveryStrips';
import { GameFilterSheet } from './GameFilterSheet';

type Props = {
  city: string;
  gatherings: readonly Gathering[];
  latitude: number | null;
  longitude: number | null;
  onCreateGathering: () => void;
  onOpenGathering: (gatheringId: string) => void;
};

export function FindGames({ city, gatherings, latitude, longitude, onCreateGathering, onOpenGathering }: Props) {
  const discovery = useFindGames(gatherings);
  const courtsQuery = useCourtDiscovery({
    enabled: discovery.resultType === 'courts',
    latitude,
    longitude,
  });
  const courts = courtsQuery.data ?? [];
  const resultCount = discovery.resultType === 'games' ? discovery.games.length : courts.length;

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={styles.title}>{discovery.resultType === 'games' ? 'Games' : 'Courts'} near {city}</Text>
          <Text style={styles.subtitle}>{resultCount} matching {discovery.resultType === 'games' ? 'sessions' : 'badminton venues'}</Text>
        </View>
        <View style={styles.headingActions}>
          {discovery.resultType === 'games' && (
            <Pressable accessibilityLabel="Open game filters" accessibilityRole="button" onPress={discovery.openFilters} style={styles.filterButton}>
              <Ionicons color={colors.primaryStrong} name="options-outline" size={24} />
              {discovery.activeFilterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{discovery.activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
          )}
          <ResultsLayoutToggle layout={discovery.layout} onToggle={discovery.toggleLayout} />
        </View>
      </View>

      {discovery.resultType === 'games' && (
        <View style={styles.discoveryStrips}>
          <GameDateStrip onChange={discovery.selectDate} value={discovery.filters.date} />
          <GameQuickFilterStrip onChange={discovery.selectQuickFilter} value={discovery.quickFilter} />
        </View>
      )}

      <DiscoveryResultTabs onChange={discovery.selectResultType} value={discovery.resultType} />

      {discovery.layout === 'map' ? (
        discovery.resultType === 'games' ? (
          <GameMap city={city} games={discovery.games} onOpenGathering={onOpenGathering} />
        ) : (
          <CourtMap city={city} courts={courts} />
        )
      ) : (
        discovery.resultType === 'games' ? (
          <GameResultsList games={discovery.games} onCreateGathering={onCreateGathering} onOpenGathering={onOpenGathering} />
        ) : (
          <CourtResults courts={courts} isLoading={courtsQuery.isPending} />
        )
      )}

      <GameFilterSheet
        filters={discovery.filters}
        onApply={discovery.applyFilters}
        onClose={discovery.closeFilters}
        resultCount={discovery.games.length}
        visible={discovery.filtersOpen}
      />
    </View>
  );
}

function useFindGames(gatherings: readonly Gathering[]) {
  const [filters, setFilters] = useState(defaultGameDiscoveryFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layout, setLayout] = useState<GameResultsLayout>('list');
  const [resultType, setResultType] = useState<DiscoveryResultType>('games');
  const games = useMemo(() => filterGames(gatherings, filters), [filters, gatherings]);
  const openFilters = useCallback(() => setFiltersOpen(true), []);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const applyFilters = useCallback((next: GameDiscoveryFilters) => {
    setFilters(next);
    setFiltersOpen(false);
  }, []);
  const toggleLayout = useCallback(() => {
    setLayout((current) => current === 'map' ? 'list' : 'map');
  }, []);
  const selectDate = useCallback((date: GameDateFilter) => {
    setFilters((current) => ({ ...current, date }));
  }, []);
  const selectQuickFilter = useCallback((quickFilter: GameQuickFilter) => {
    setFilters((current) => applyQuickFilter(current, quickFilter));
  }, []);
  const selectResultType = useCallback((next: DiscoveryResultType) => setResultType(next), []);
  return {
    activeFilterCount: activeGameFilterCount(filters),
    applyFilters,
    closeFilters,
    filters,
    filtersOpen,
    games,
    layout,
    openFilters,
    quickFilter: quickFilterFor(filters),
    resultType,
    selectDate,
    selectQuickFilter,
    selectResultType,
    toggleLayout,
  };
}

function ResultsLayoutToggle({ layout, onToggle }: { layout: GameResultsLayout; onToggle: () => void }) {
  const showingMap = layout === 'map';
  return (
    <Pressable
      accessibilityLabel={showingMap ? 'Show game tiles' : 'Show games on map'}
      accessibilityRole="button"
      accessibilityState={{ selected: showingMap }}
      onPress={onToggle}
      style={styles.layoutToggle}
    >
      <Ionicons
        color={colors.textInverse}
        name={showingMap ? 'grid-outline' : 'map-outline'}
        size={25}
      />
    </Pressable>
  );
}

function GameResultsList({ games, onCreateGathering, onOpenGathering }: {
  games: readonly Gathering[];
  onCreateGathering: () => void;
  onOpenGathering: (gatheringId: string) => void;
}) {
  if (games.length === 0) {
    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons color={colors.primary} name="badminton" size={42} />
        <Text style={styles.emptyTitle}>No matching games yet</Text>
        <Text style={styles.emptyBody}>Adjust your filters or host the first session nearby.</Text>
        <Pressable accessibilityRole="button" onPress={onCreateGathering} style={styles.hostButton}>
          <Text style={styles.hostButtonText}>Host a session</Text>
        </Pressable>
      </View>
    );
  }
  return <View style={styles.gameList}>{games.map((game) => <GameListItem game={game} key={game.id} onOpen={onOpenGathering} />)}</View>;
}

function GameListItem({ game, onOpen }: { game: Gathering; onOpen: Props['onOpenGathering'] }) {
  const open = useGameOpenAction(game.id, onOpen);
  const startsAt = new Date(game.starts_at);
  return (
    <Pressable accessibilityRole="button" onPress={open} style={styles.gameRow}>
      <View style={styles.dateTile}>
        <Text style={styles.dateMonth}>{formatMonth(startsAt)}</Text>
        <Text style={styles.dateDay}>{formatDay(startsAt)}</Text>
      </View>
      <View style={styles.gameCopy}>
        <Text style={styles.gameTime}>{formatTime(startsAt)}</Text>
        <Text numberOfLines={1} style={styles.gameTitle}>{game.title}</Text>
        <Text numberOfLines={1} style={styles.gameVenue}>{game.venue} · {game.city}</Text>
        <Text style={styles.gameMetadata}>{gameMetadata(game)}</Text>
      </View>
      <Ionicons color={colors.textMuted} name="chevron-forward" size={22} />
    </Pressable>
  );
}

function useGameOpenAction(gameId: string, onOpen: Props['onOpenGathering']) {
  return useCallback(() => onOpen(gameId), [gameId, onOpen]);
}

function GameMap({ city, games, onOpenGathering }: {
  city: string;
  games: readonly Gathering[];
  onOpenGathering: Props['onOpenGathering'];
}) {
  const mappedGames = games.filter(hasCoordinates);
  const region = mapRegion(mappedGames);
  return (
    <ExpandableMap
      accessibilityLabel={`${mappedGames.length} mapped games near ${city}`}
      initialRegion={region}
      mapName="games map"
      overlay={mappedGames.length === 0 ? (
        <View pointerEvents="none" style={styles.mapEmpty}>
          <MaterialCommunityIcons color={colors.primary} name="map-marker-off-outline" size={34} />
          <Text style={styles.mapTitle}>No mapped games near {city}</Text>
          <Text style={styles.mapBody}>New sessions will appear here after a location is selected.</Text>
        </View>
      ) : undefined}
    >
      {mappedGames.map((game) => (
        <GameMarker game={game} key={game.id} onOpen={onOpenGathering} />
      ))}
    </ExpandableMap>
  );
}

function CourtMap({ city, courts }: { city: string; courts: readonly Court[] }) {
  return (
    <ExpandableMap
      accessibilityLabel={`${courts.length} badminton courts near ${city}`}
      initialRegion={mapRegion(courts)}
      mapName="courts map"
    >
      {courts.map((court) => <CourtMarker court={court} key={court.id} />)}
    </ExpandableMap>
  );
}

function ExpandableMap({
  accessibilityLabel,
  children,
  initialRegion,
  mapName,
  overlay,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  initialRegion: Region;
  mapName: string;
  overlay?: ReactNode;
}) {
  const expansion = useMapExpansion(initialRegion);
  const insets = useSafeAreaInsets();
  const map = (
    <MapSurface
      accessibilityLabel={accessibilityLabel}
      expanded={expansion.expanded}
      initialRegion={expansion.region.current}
      mapName={mapName}
      onRegionChangeComplete={expansion.rememberRegion}
      onToggle={expansion.toggle}
      overlay={overlay}
      safeAreaRight={insets.right}
      safeAreaTop={insets.top}
    >
      {children}
    </MapSurface>
  );

  if (!expansion.expanded) return map;

  return (
    <>
      <View style={styles.mapContainer} />
      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={expansion.toggle}
        presentationStyle="fullScreen"
        statusBarTranslucent
        visible
      >
        {map}
      </Modal>
    </>
  );
}

function useMapExpansion(initialRegion: Region) {
  const [expanded, setExpanded] = useState(false);
  const region = useRef(initialRegion);
  const toggle = useCallback(() => setExpanded((current) => !current), []);
  const rememberRegion = useCallback((nextRegion: Region) => {
    region.current = nextRegion;
  }, []);
  return { expanded, region, rememberRegion, toggle };
}

function MapSurface({
  accessibilityLabel,
  children,
  expanded,
  initialRegion,
  mapName,
  onRegionChangeComplete,
  onToggle,
  overlay,
  safeAreaRight,
  safeAreaTop,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  expanded: boolean;
  initialRegion: Region;
  mapName: string;
  onRegionChangeComplete: (region: Region) => void;
  onToggle: () => void;
  overlay?: ReactNode;
  safeAreaRight: number;
  safeAreaTop: number;
}) {
  const controlPosition = expanded
    ? { right: Math.max(safeAreaRight, 12), top: Math.max(safeAreaTop, 12) }
    : styles.mapExpandButtonInset;
  return (
    <View style={[styles.mapContainer, expanded && styles.mapContainerExpanded]}>
      <MapView
        accessibilityLabel={accessibilityLabel}
        initialRegion={initialRegion}
        loadingEnabled
        onRegionChangeComplete={onRegionChangeComplete}
        provider={mapProvider()}
        showsUserLocation
        style={styles.map}
      >
        {children}
      </MapView>
      {overlay}
      <Pressable
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${mapName}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.mapExpandButton,
          controlPosition,
          pressed && styles.mapExpandButtonPressed,
        ]}
      >
        <Ionicons
          color={colors.primaryStrong}
          name={expanded ? 'contract-outline' : 'expand-outline'}
          size={24}
        />
      </Pressable>
    </View>
  );
}

function CourtMarker({ court }: { court: Court }) {
  const open = useCourtMarkerAction(court);
  return (
    <Marker
      coordinate={{ latitude: court.latitude, longitude: court.longitude }}
      description={`${court.address} · ${court.court_count ?? '?'} courts`}
      onCalloutPress={open}
      pinColor={colors.playAccentStrong}
      title={court.name}
    />
  );
}

function useCourtMarkerAction(court: Court) {
  return useCallback(() => {
    const destination = encodeURIComponent(`${court.latitude},${court.longitude}`);
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
  }, [court.latitude, court.longitude]);
}

function mapProvider(): Provider | undefined {
  if (Platform.OS === 'ios' && isRunningInExpoGo()) return undefined;
  const configuredForGoogleOnIos = Constants.expoConfig?.extra?.googleMapsProvider === 'google';
  return Platform.OS === 'android' || configuredForGoogleOnIos ? PROVIDER_GOOGLE : undefined;
}

function GameMarker({ game, onOpen }: { game: Gathering; onOpen: Props['onOpenGathering'] }) {
  const open = useGameOpenAction(game.id, onOpen);
  return (
    <Marker
      coordinate={{ latitude: game.latitude as number, longitude: game.longitude as number }}
      description={`${formatTime(new Date(game.starts_at))} · ${game.venue}`}
      onCalloutPress={open}
      pinColor={colors.primary}
      title={game.title}
    />
  );
}

function hasCoordinates(game: Gathering) {
  return typeof game.latitude === 'number' && typeof game.longitude === 'number';
}

type CoordinateItem = { latitude?: number | null; longitude?: number | null };

function mapRegion(items: readonly CoordinateItem[]): Region {
  if (items.length === 0) {
    return { latitude: 37.8044, latitudeDelta: 0.32, longitude: -122.2712, longitudeDelta: 0.32 };
  }
  const latitudes = items.map((item) => item.latitude as number);
  const longitudes = items.map((item) => item.longitude as number);
  const minimumLatitude = Math.min(...latitudes);
  const maximumLatitude = Math.max(...latitudes);
  const minimumLongitude = Math.min(...longitudes);
  const maximumLongitude = Math.max(...longitudes);
  return {
    latitude: (minimumLatitude + maximumLatitude) / 2,
    latitudeDelta: Math.max((maximumLatitude - minimumLatitude) * 1.6, 0.06),
    longitude: (minimumLongitude + maximumLongitude) / 2,
    longitudeDelta: Math.max((maximumLongitude - minimumLongitude) * 1.6, 0.06),
  };
}

function formatMonth(date: Date) { return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date).toUpperCase(); }
function formatDay(date: Date) { return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(date); }
function formatTime(date: Date) { return Number.isNaN(date.getTime()) ? 'Time TBD' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date); }
function gameMetadata(game: Gathering) {
  const level = game.skill_level === 'e_plus' ? 'E+' : game.skill_level?.toUpperCase() ?? 'All levels';
  const setup = game.court_setup === 'reserved' ? 'Reserved courts' : 'Drop-in';
  const cost = game.cost_per_person_cents > 0 ? `$${(game.cost_per_person_cents / 100).toFixed(2)}` : 'Free';
  return `${level} · ${setup} · ${cost}`;
}

const styles = StyleSheet.create({
  container: { gap: 16 }, headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, headingCopy: { flex: 1, gap: 2, minWidth: 0 },
  title: { color: colors.text, fontFamily: fonts.black, fontSize: 22, fontWeight: '900' }, subtitle: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 13 },
  headingActions: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  filterButton: { alignItems: 'center', backgroundColor: colors.primarySurface, borderColor: colors.borderStrong, borderRadius: 12, borderWidth: 1, height: 46, justifyContent: 'center', width: 50 },
  filterBadge: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 9, height: 18, justifyContent: 'center', minWidth: 18, position: 'absolute', right: -5, top: -6 },
  filterBadgeText: { color: colors.textOnPrimary, fontFamily: fonts.black, fontSize: 10, fontWeight: '900' },
  layoutToggle: { alignItems: 'center', backgroundColor: colors.primaryStrong, borderRadius: 12, height: 46, justifyContent: 'center', width: 50 },
  discoveryStrips: { gap: 10 },
  gameList: { borderBottomColor: colors.border, borderBottomWidth: 1 }, gameRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 13, minHeight: 116, paddingVertical: 14 },
  dateTile: { alignItems: 'center', backgroundColor: colors.primarySurface, borderRadius: 12, justifyContent: 'center', minHeight: 66, width: 58 }, dateMonth: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 10, fontWeight: '900' }, dateDay: { color: colors.text, fontFamily: fonts.black, fontSize: 25, fontWeight: '900' },
  gameCopy: { flex: 1, gap: 2, minWidth: 0 }, gameTime: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' }, gameTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 16, fontWeight: '900' }, gameVenue: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12 }, gameMetadata: { color: colors.text, fontFamily: fonts.bold, fontSize: 11, marginTop: 4 },
  emptyState: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 7, padding: 28 }, emptyTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' }, emptyBody: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' }, hostButton: { backgroundColor: colors.primary, borderRadius: 12, marginTop: 8, paddingHorizontal: 18, paddingVertical: 11 }, hostButtonText: { color: colors.textOnPrimary, fontFamily: fonts.black, fontSize: 13, fontWeight: '900' },
  mapContainer: { borderColor: colors.borderStrong, borderRadius: 18, borderWidth: 1, height: 410, overflow: 'hidden' },
  mapContainerExpanded: { borderRadius: 0, borderWidth: 0, flex: 1, height: undefined },
  map: { height: '100%', width: '100%' },
  mapEmpty: { alignItems: 'center', backgroundColor: colors.surfaceOverlay, borderRadius: 16, bottom: 18, gap: 5, left: 18, padding: 14, position: 'absolute', right: 18 },
  mapExpandButton: { alignItems: 'center', backgroundColor: colors.surfaceOverlay, borderColor: colors.borderStrong, borderRadius: 23, borderWidth: 1, height: 46, justifyContent: 'center', position: 'absolute', width: 46 },
  mapExpandButtonInset: { right: 12, top: 12 },
  mapExpandButtonPressed: { backgroundColor: colors.primarySurfacePressed },
  mapTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 18, fontWeight: '900', textAlign: 'center' }, mapBody: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 12, maxWidth: 260, textAlign: 'center' },
});
