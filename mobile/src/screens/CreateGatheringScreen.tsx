import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '../auth/session';
import {
  GatheringAccessDetails,
  GatheringCover,
  GatheringCreatorHeader,
  GatheringDetailsFields,
  GatheringKindPicker,
  GatheringLocationFields,
  GatheringPlayDetails,
  GatheringScheduleSection,
  GatheringSocialDetails,
  GatheringThemePicker,
} from '../components/gatherings';
import { Button, TextField, colors, fonts } from '../components/ui';
import {
  gatheringKindLabel,
  isPlayGathering,
  isSocialGathering,
  parseGatheringKind,
} from '../features/gatherings/gatheringDraft';
import {
  useGatheringCoverPicker,
  useGatheringCreatorClose,
  useGatheringPublisher,
} from '../features/gatherings/useGatheringCreator';
import { useGatheringDraft } from '../features/gatherings/useGatheringDraft';

export function CreateGatheringScreen() {
  const params = useLocalSearchParams<{ city?: string | string[]; kind?: string | string[] }>();
  const { user } = useSession();
  const draft = useGatheringDraft(singleParam(params.city) || 'Oakland', parseGatheringKind(params.kind));
  const close = useGatheringCreatorClose(draft.isDirty);
  const publisher = useGatheringPublisher(draft.value, user?.id ?? '', close.allowNextRemoval);
  const pickCover = useGatheringCoverPicker(draft.setCoverPhoto);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <StatusBar style="dark" />
      <GatheringCreatorHeader kind={draft.value.kind} onClose={close.requestClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <GatheringCover
            coverPhoto={draft.value.coverPhoto}
            dateLabel={formatCoverDate(draft.value.startsAt)}
            hostName={user?.display_name ?? 'You'}
            kind={draft.value.kind}
            onEditCover={pickCover}
            themeId={draft.value.theme}
            title={draft.value.title}
          />

          <GatheringThemePicker onChange={draft.setTheme} value={draft.value.theme} />

          <TextField
            accessibilityLabel="Gathering title"
            maxLength={120}
            onChangeText={draft.setTitle}
            placeholder="Friday night rallies"
            style={styles.titleInput}
            value={draft.value.title}
          />

          <GatheringKindPicker onChange={draft.setKind} value={draft.value.kind} />

          <GatheringScheduleSection
            endsAt={draft.value.endsAt}
            onEndsAtChange={draft.setEndsAt}
            onStartsAtChange={draft.setStartsAt}
            startsAt={draft.value.startsAt}
          />

          <GatheringLocationFields
            city={draft.value.city}
            onCityChange={draft.setCity}
            onVenueChange={draft.setVenue}
            venue={draft.value.venue}
          />

          {isPlayGathering(draft.value.kind) && (
            <GatheringPlayDetails
              courtCount={draft.value.courtCount}
              onCourtCountChange={draft.setCourtCount}
              onFormatChange={draft.setPlayFormat}
              onSkillChange={draft.setSkillLevel}
              playFormat={draft.value.playFormat}
              skillLevel={draft.value.skillLevel}
            />
          )}

          {isSocialGathering(draft.value.kind) && (
            <GatheringSocialDetails
              onToggleTag={draft.toggleSocialTag}
              selectedTags={draft.value.socialTags}
            />
          )}

          <GatheringAccessDetails
            onVisibilityChange={draft.setVisibility}
            visibility={draft.value.visibility}
          />

          <GatheringDetailsFields
            capacity={draft.value.capacity}
            costPerPerson={draft.value.costPerPerson}
            description={draft.value.description}
            onCapacityChange={draft.setCapacity}
            onCostPerPersonChange={draft.setCostPerPerson}
            onDescriptionChange={draft.setDescription}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button disabled={!publisher.canSubmit} loading={publisher.isPending} onPress={publisher.submit}>
            Publish {gatheringKindLabel(draft.value.kind).toLowerCase()}
          </Button>
          <Text style={styles.footerNote}>
            {draft.value.visibility === 'public'
              ? 'It will appear in Discover as soon as it is published.'
              : 'Private gatherings stay out of public Discover.'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatCoverDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(value);
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F4F8FF', flex: 1 },
  keyboardView: { flex: 1 },
  content: { gap: 18, padding: 18, paddingBottom: 36 },
  titleInput: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: colors.ink,
    fontFamily: fonts.black,
    fontSize: 27,
    fontWeight: '900',
    minHeight: 62,
    paddingHorizontal: 2,
  },
  footer: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 7,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  footerNote: {
    color: colors.muted,
    fontFamily: fonts.medium,
    fontSize: 10,
    paddingBottom: 4,
    textAlign: 'center',
  },
});
