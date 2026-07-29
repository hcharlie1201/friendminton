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
  const params = useLocalSearchParams<{
    city?: string | string[];
    groupId?: string | string[];
    groupName?: string | string[];
    kind?: string | string[];
  }>();
  const { user } = useSession();
  const groupId = singleParam(params.groupId);
  const groupName = singleParam(params.groupName);
  const draft = useGatheringDraft(singleParam(params.city) || 'Oakland', parseGatheringKind(params.kind));
  const close = useGatheringCreatorClose(draft.isDirty);
  const publisher = useGatheringPublisher(draft.value, user?.id ?? '', close.allowNextRemoval, groupId);
  const pickCover = useGatheringCoverPicker(draft.setCoverPhoto);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <StatusBar style="dark" />
      <GatheringCreatorHeader kind={draft.value.kind} onClose={close.requestClose} />
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: 'height' })} style={styles.keyboardView}>
        <ScrollView
          automaticallyAdjustKeyboardInsets
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

          <View style={styles.titleField}>
            <Text style={styles.titleLabel}>EVENT TITLE</Text>
            <TextField
              accessibilityLabel="Event title"
              maxLength={120}
              onChangeText={draft.setTitle}
              placeholder="e.g. Friday night rallies"
              style={styles.titleInput}
              value={draft.value.title}
            />
            <Text style={styles.titleHelp}>Give players a clear name they’ll recognize in Discover.</Text>
          </View>

          {groupId && (
            <View style={styles.groupAffiliation}>
              <Text style={styles.groupAffiliationLabel}>GROUP EVENT</Text>
              <Text style={styles.groupAffiliationName}>{groupName || 'Your badminton group'}</Text>
              <Text style={styles.groupAffiliationBody}>This event will appear in the group Events tab. Closed-group access requests stay pending until approved.</Text>
            </View>
          )}

          <GatheringKindPicker onChange={draft.setKind} value={draft.value.kind} />

          <GatheringScheduleSection
            endsAt={draft.value.endsAt}
            onEndsAtChange={draft.setEndsAt}
            onStartsAtChange={draft.setStartsAt}
            startsAt={draft.value.startsAt}
          />

          <GatheringLocationFields
            onLocationChange={draft.setLocation}
            value={draft.value.location}
          />

          {isPlayGathering(draft.value.kind) && (
            <GatheringPlayDetails
              courtCount={draft.value.courtCount}
              courtSetup={draft.value.courtSetup}
              onCourtCountChange={draft.setCourtCount}
              onCourtSetupChange={draft.setCourtSetup}
              onFormatChange={draft.setPlayFormat}
              onSkillMaxChange={draft.setSkillLevelMax}
              onSkillMinChange={draft.setSkillLevelMin}
              playFormat={draft.value.playFormat}
              skillLevelMax={draft.value.skillLevelMax}
              skillLevelMin={draft.value.skillLevelMin}
            />
          )}

          {isSocialGathering(draft.value.kind) && (
            <GatheringSocialDetails
              onToggleTag={draft.toggleSocialTag}
              selectedTags={draft.value.socialTags}
            />
          )}

          {!groupId && (
            <GatheringAccessDetails
              onVisibilityChange={draft.setVisibility}
              visibility={draft.value.visibility}
            />
          )}

          <GatheringDetailsFields
            capacity={draft.value.capacity}
            costPerPersonCents={draft.value.costPerPersonCents}
            description={draft.value.description}
            onCapacityChange={draft.setCapacity}
            onCostPerPersonCentsChange={draft.setCostPerPersonCents}
            onDescriptionChange={draft.setDescription}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button loading={publisher.isPending} onPress={publisher.submit}>
            Publish {gatheringKindLabel(draft.value.kind).toLowerCase()}
          </Button>
          <Text style={styles.footerNote}>
            {groupId
              ? 'Group events stay visible; participation follows the group access rules.'
              : draft.value.visibility === 'public'
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
    year: 'numeric',
  }).format(value);
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  keyboardView: { flex: 1 },
  content: { gap: 18, padding: 18, paddingBottom: 36 },
  titleField: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 18,
    borderWidth: 1,
    gap: 7,
    padding: 14,
    shadowColor: colors.shadow,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 1,
  },
  titleLabel: {
    color: colors.primaryStrong,
    fontFamily: fonts.black,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  titleInput: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
    borderRadius: 12,
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 24,
    fontWeight: '900',
    minHeight: 64,
    paddingHorizontal: 13,
  },
  titleHelp: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 16,
  },
  groupAffiliation: {
    backgroundColor: colors.playAccentSurface,
    borderColor: colors.playAccent,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  groupAffiliationLabel: { color: colors.playAccentStrong, fontFamily: fonts.black, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  groupAffiliationName: { color: colors.text, fontFamily: fonts.black, fontSize: 16, fontWeight: '900' },
  groupAffiliationBody: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11, lineHeight: 16 },
  footer: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 7,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  footerNote: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
    paddingBottom: 4,
    textAlign: 'center',
  },
});
