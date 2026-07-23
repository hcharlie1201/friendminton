import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  postApiGroups,
  type BadmintonGroup,
  type CreateBadmintonGroup,
  type GroupGoal,
  type GroupJoinPolicy,
  type GroupVisibility,
} from '../api/generated';
import { apiData, authHeaders } from '../api/runtime';
import { useSession } from '../auth/session';
import { errorMessage } from '../common/errors';
import { LocationAutocomplete, type SelectedLocation } from '../components/location';
import { Button, colors, fonts } from '../components/ui';
import { resolveGroupCoverUrl } from '../features/groups/groupPresentation';
import { getCurrentLocation } from '../features/location/currentCity';
import { uploadImage } from '../features/uploads/uploadImage';

const stepCount = 5;

const goalOptions: readonly GoalOption[] = [
  { description: 'Friendly games, laughs, and a low-pressure crew.', icon: 'party-popper', label: 'Just for fun', value: 'social' },
  { description: 'Practice together and keep sharpening your game.', icon: 'trending-up', label: 'Get better', value: 'improvement' },
  { description: 'Make movement and regular court time a habit.', icon: 'heart-pulse', label: 'Stay active', value: 'fitness' },
  { description: 'Train for ladders, leagues, and tournaments.', icon: 'trophy-outline', label: 'Compete', value: 'competitive' },
  { description: 'Build a dependable group that plays every week.', icon: 'calendar-refresh', label: 'Play consistently', value: 'consistent_play' },
];

const accessOptions: readonly AccessOption[] = [
  {
    description: 'Anyone can discover and join immediately.',
    icon: 'earth',
    joinPolicy: 'open',
    label: 'Public and open',
    visibility: 'public',
  },
  {
    description: 'Anyone can discover the group; you approve new members.',
    icon: 'account-check-outline',
    joinPolicy: 'approval_required',
    label: 'Public with approval',
    visibility: 'public',
  },
  {
    description: 'Only invited people can view and join the group.',
    icon: 'lock-outline',
    joinPolicy: 'invite_only',
    label: 'Private and invite-only',
    visibility: 'private',
  },
];

type GoalOption = {
  description: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: GroupGoal;
};

type AccessOption = {
  description: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  joinPolicy: GroupJoinPolicy;
  label: string;
  visibility: GroupVisibility;
};

type GroupDraft = {
  city: string;
  description: string;
  goalTags: GroupGoal[];
  joinPolicy: GroupJoinPolicy;
  location: SelectedLocation | null;
  locationMode: GroupLocationMode;
  name: string;
  photos: GroupPhoto[];
  visibility: GroupVisibility;
};

type GroupLocationMode = 'current' | 'search' | null;

type GroupPhoto = {
  fileName?: string | null;
  mimeType?: string | null;
  uri: string;
};

export function CreateGroupScreen() {
  const params = useLocalSearchParams<{ city?: string | string[] }>();
  const { user } = useSession();
  const flow = useCreateGroupFlow(singleParam(params.city), user?.id ?? '');

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <FlowHeader
          canGoBack={flow.step > 0}
          onBack={flow.goBack}
          onClose={flow.close}
          step={flow.step}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepContent draft={flow.draft} flow={flow} step={flow.step} />
        </ScrollView>
        <FlowFooter
          disabled={!flow.canContinue}
          label={flow.step === stepCount - 1 ? 'Create group' : 'Next'}
          loading={flow.isCreating}
          onPress={flow.continueFlow}
        />
      </KeyboardAvoidingView>
      <CreationSuccess
        group={flow.createdGroup}
        onClose={flow.finish}
        onGetStarted={flow.finish}
      />
    </SafeAreaView>
  );
}

function FlowHeader({
  canGoBack,
  onBack,
  onClose,
  step,
}: {
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  step: number;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Pressable
          accessibilityLabel={canGoBack ? 'Previous step' : 'Close group creation'}
          accessibilityRole="button"
          hitSlop={10}
          onPress={canGoBack ? onBack : onClose}
          style={headerButtonStyle}
        >
          <Ionicons color={colors.text} name="chevron-back" size={30} />
        </Pressable>
        <Text style={styles.headerStep}>STEP {step + 1} OF {stepCount}</Text>
        <Pressable
          accessibilityLabel="Close group creation"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onClose}
          style={headerButtonStyle}
        >
          <Ionicons color={colors.text} name="close" size={31} />
        </Pressable>
      </View>
      <View style={styles.progress}>
        {Array.from({ length: stepCount }, (_, index) => (
          <View
            key={index}
            style={[styles.progressSegment, index <= step && styles.progressSegmentActive]}
          />
        ))}
      </View>
    </View>
  );
}

function StepContent({
  draft,
  flow,
  step,
}: {
  draft: GroupDraft;
  flow: CreateGroupFlow;
  step: number;
}) {
  switch (step) {
    case 0:
      return <SportStep />;
    case 1:
      return <GoalsStep goals={draft.goalTags} onToggle={flow.toggleGoal} />;
    case 2:
      return (
        <DetailsStep
          description={draft.description}
          isLocating={flow.isLocating}
          location={draft.location}
          locationMode={draft.locationMode}
          name={draft.name}
          onDescriptionChange={flow.setDescription}
          onGoogleLocation={flow.setGoogleLocation}
          onLocationMode={flow.setLocationMode}
          onNameChange={flow.setName}
          onPickPhotos={flow.pickPhotos}
          onRemovePhoto={flow.removePhoto}
          onUseCurrentLocation={flow.useCurrentLocation}
          photos={draft.photos}
        />
      );
    case 3:
      return (
        <AccessStep
          joinPolicy={draft.joinPolicy}
          onSelect={flow.setAccess}
          visibility={draft.visibility}
        />
      );
    default:
      return <ReviewStep draft={draft} />;
  }
}

function SportStep() {
  return (
    <View style={styles.step}>
      <StepIntro
        body="Friendminton groups are built around badminton—from first games to serious match play."
        title="Choose your group's sport."
      />
      <View accessibilityRole="radiogroup" style={styles.optionList}>
        <View style={[styles.optionCard, styles.optionCardSelected]}>
          <View style={styles.optionIcon}>
            <MaterialCommunityIcons color={colors.playAccentStrong} name="badminton" size={30} />
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>Badminton</Text>
            <Text style={styles.optionDescription}>Singles, doubles, drills, open play, and everything between.</Text>
          </View>
          <View style={[styles.radio, styles.radioSelected]}>
            <View style={styles.radioDot} />
          </View>
        </View>
      </View>
      <View style={styles.tipCard}>
        <Ionicons color={colors.socialAccentStrong} name="sparkles" size={20} />
        <Text style={styles.tipText}>More sports can join Friendminton later. For now, every group gets the badminton-first experience.</Text>
      </View>
    </View>
  );
}

function GoalsStep({
  goals,
  onToggle,
}: {
  goals: readonly GroupGoal[];
  onToggle: (goal: GroupGoal) => void;
}) {
  return (
    <View style={styles.step}>
      <StepIntro
        body="Pick up to 3 tags that fit best. Let players know what your group is all about."
        title="Which best describes your group?"
      />
      <Text style={styles.selectionCount}>{goals.length}/3 selected</Text>
      <View style={styles.optionList}>
        {goalOptions.map((option) => (
          <GoalRow
            isSelected={goals.includes(option.value)}
            key={option.value}
            onToggle={onToggle}
            option={option}
          />
        ))}
      </View>
    </View>
  );
}

function GoalRow({
  isSelected,
  onToggle,
  option,
}: {
  isSelected: boolean;
  onToggle: (goal: GroupGoal) => void;
  option: GoalOption;
}) {
  const select = useGoalSelection(option.value, onToggle);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      onPress={select}
      style={optionCardStyle(isSelected)}
    >
      <View style={[styles.optionIcon, isSelected && styles.optionIconSelected]}>
        <MaterialCommunityIcons
          color={isSelected ? colors.primaryStrong : colors.textMuted}
          name={option.icon}
          size={25}
        />
      </View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{option.label}</Text>
        <Text style={styles.optionDescription}>{option.description}</Text>
      </View>
      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
        {isSelected && <Ionicons color={colors.textInverse} name="checkmark" size={18} />}
      </View>
    </Pressable>
  );
}

function DetailsStep({
  description,
  isLocating,
  location,
  locationMode,
  name,
  onDescriptionChange,
  onGoogleLocation,
  onLocationMode,
  onNameChange,
  onPickPhotos,
  onRemovePhoto,
  onUseCurrentLocation,
  photos,
}: {
  description: string;
  isLocating: boolean;
  location: SelectedLocation | null;
  locationMode: GroupLocationMode;
  name: string;
  onDescriptionChange: (value: string) => void;
  onGoogleLocation: (value: SelectedLocation) => void;
  onLocationMode: (mode: GroupLocationMode) => void;
  onNameChange: (value: string) => void;
  onPickPhotos: () => void;
  onRemovePhoto: (index: number) => void;
  onUseCurrentLocation: () => void;
  photos: readonly GroupPhoto[];
}) {
  return (
    <View style={styles.step}>
      <StepIntro
        body="Give players enough context to recognize your crew and know where you meet."
        title="Tell us about your group."
      />
      <GroupCoverPicker
        onPick={onPickPhotos}
        onRemove={onRemovePhoto}
        photos={photos}
      />
      <View style={styles.fields}>
        <FieldLabel label="Group name" required />
        <TextInput
          accessibilityLabel="Group name"
          autoCapitalize="words"
          maxLength={120}
          onChangeText={onNameChange}
          placeholder="East Bay Birdies"
          placeholderTextColor={colors.textSubtle}
          returnKeyType="next"
          style={styles.input}
          value={name}
        />
        <Text style={styles.characterCount}>{name.length}/120</Text>

        <GroupLocationPicker
          isLocating={isLocating}
          location={location}
          mode={locationMode}
          onGoogleLocation={onGoogleLocation}
          onModeChange={onLocationMode}
          onUseCurrentLocation={onUseCurrentLocation}
        />

        <FieldLabel label="Description" />
        <TextInput
          accessibilityLabel="Group description"
          maxLength={3000}
          multiline
          onChangeText={onDescriptionChange}
          placeholder="What kind of games do you play? Who should join?"
          placeholderTextColor={colors.textSubtle}
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
          value={description}
        />
        <Text style={styles.characterCount}>{description.length}/3000</Text>
      </View>
    </View>
  );
}

function GroupLocationPicker({
  isLocating,
  location,
  mode,
  onGoogleLocation,
  onModeChange,
  onUseCurrentLocation,
}: {
  isLocating: boolean;
  location: SelectedLocation | null;
  mode: GroupLocationMode;
  onGoogleLocation: (value: SelectedLocation) => void;
  onModeChange: (mode: GroupLocationMode) => void;
  onUseCurrentLocation: () => void;
}) {
  const search = useLocationModeSelection('search', onModeChange);
  return (
    <View style={styles.locationField}>
      <View style={styles.locationTitleRow}>
        <FieldLabel label="Group area" required />
        <Ionicons color={colors.textSubtle} name="shield-checkmark-outline" size={17} />
      </View>
      <Text style={styles.locationPrivacy}>We show a general area—not your exact live location.</Text>
      <View style={styles.locationChoices}>
        <LocationChoice
          description="Use a rough area around where you are now."
          icon="navigate-circle-outline"
          isLoading={isLocating}
          isSelected={mode === 'current'}
          label="Near me"
          onPress={onUseCurrentLocation}
        />
        <LocationChoice
          description="Search a city, neighborhood, court, or address."
          icon="search-outline"
          isSelected={mode === 'search'}
          label="Search with Google"
          onPress={search}
        />
      </View>
      {mode === 'search' && (
        <LocationAutocomplete
          onSelect={onGoogleLocation}
          placeholder="Search city, neighborhood, or court"
          value={location}
        />
      )}
      {location && (
        <View style={styles.selectedLocation}>
          <Ionicons color={colors.primaryStrong} name="location" size={18} />
          <View style={styles.selectedLocationCopy}>
            <Text style={styles.selectedLocationLabel}>{location.label}</Text>
            <Text numberOfLines={1} style={styles.selectedLocationAddress}>{location.address}</Text>
          </View>
          <Ionicons color={colors.success} name="checkmark-circle" size={21} />
        </View>
      )}
    </View>
  );
}

function LocationChoice({
  description,
  icon,
  isLoading = false,
  isSelected,
  label,
  onPress,
}: {
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  isLoading?: boolean;
  isSelected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      disabled={isLoading}
      onPress={onPress}
      style={locationChoiceStyle(isSelected)}
    >
      {isLoading
        ? <ActivityIndicator color={colors.primaryStrong} size="small" />
        : <Ionicons color={isSelected ? colors.primaryStrong : colors.textMuted} name={icon} size={24} />}
      <View style={styles.locationChoiceCopy}>
        <Text style={styles.locationChoiceLabel}>{label}</Text>
        <Text style={styles.locationChoiceDescription}>{description}</Text>
      </View>
      <View style={[styles.radio, isSelected && styles.radioSelected]}>
        {isSelected && <View style={styles.radioDot} />}
      </View>
    </Pressable>
  );
}

function GroupCoverPicker({
  onPick,
  onRemove,
  photos,
}: {
  onPick: () => void;
  onRemove: (index: number) => void;
  photos: readonly GroupPhoto[];
}) {
  const canAdd = photos.length < 5;

  return (
    <View style={styles.coverField}>
      <View style={styles.coverHeading}>
        <View style={styles.coverHeadingCopy}>
          <Text style={styles.fieldLabel}>Group pictures</Text>
          <Text style={styles.coverHint}>Add up to 5. Your first photo becomes the cover.</Text>
        </View>
        <Text style={styles.photoCount}>{photos.length}/5</Text>
      </View>
      {photos.length === 0 ? (
        <Pressable
          accessibilityLabel="Add group pictures"
          accessibilityRole="button"
          onPress={onPick}
          style={coverPickerStyle}
        >
          <View style={styles.coverEmpty}>
            <View style={styles.coverEmptyIcon}>
              <Ionicons color={colors.primaryStrong} name="images-outline" size={30} />
            </View>
            <Text style={styles.coverEmptyTitle}>Add group pictures</Text>
            <Text style={styles.coverEmptyBody}>Choose photos of your crew, games, or favorite court.</Text>
          </View>
        </Pressable>
      ) : (
        <ScrollView
          contentContainerStyle={styles.photoStrip}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {photos.map((photo, index) => (
            <GroupPhotoTile
              index={index}
              key={`${photo.uri}-${index}`}
              onRemove={onRemove}
              photo={photo}
            />
          ))}
          {canAdd && (
            <Pressable
              accessibilityLabel="Add more group pictures"
              accessibilityRole="button"
              onPress={onPick}
              style={addPhotoTileStyle}
            >
              <Ionicons color={colors.primaryStrong} name="add" size={30} />
              <Text style={styles.addPhotoText}>Add more</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function GroupPhotoTile({
  index,
  onRemove,
  photo,
}: {
  index: number;
  onRemove: (index: number) => void;
  photo: GroupPhoto;
}) {
  const remove = usePhotoRemoval(index, onRemove);
  return (
    <View style={styles.photoTile}>
      <Image resizeMode="cover" source={{ uri: photo.uri }} style={styles.photoTileImage} />
      {index === 0 && <Text style={styles.coverBadge}>Cover</Text>}
      <Pressable
        accessibilityLabel={`Remove group picture ${index + 1}`}
        accessibilityRole="button"
        hitSlop={7}
        onPress={remove}
        style={styles.removePhotoButton}
      >
        <Ionicons color={colors.textInverse} name="close" size={17} />
      </Pressable>
    </View>
  );
}

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}{required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

function AccessStep({
  joinPolicy,
  onSelect,
  visibility,
}: {
  joinPolicy: GroupJoinPolicy;
  onSelect: (option: AccessOption) => void;
  visibility: GroupVisibility;
}) {
  return (
    <View style={styles.step}>
      <StepIntro
        body="Control who can discover your group and how new players become members."
        title="Who can join?"
      />
      <View accessibilityRole="radiogroup" style={styles.optionList}>
        {accessOptions.map((option) => (
          <AccessRow
            isSelected={option.visibility === visibility && option.joinPolicy === joinPolicy}
            key={option.label}
            onSelect={onSelect}
            option={option}
          />
        ))}
      </View>
      <View style={styles.tipCard}>
        <Ionicons color={colors.socialAccentStrong} name="information-circle-outline" size={21} />
        <Text style={styles.tipText}>You can change access rules later from group settings.</Text>
      </View>
    </View>
  );
}

function AccessRow({
  isSelected,
  onSelect,
  option,
}: {
  isSelected: boolean;
  onSelect: (option: AccessOption) => void;
  option: AccessOption;
}) {
  const select = useAccessSelection(option, onSelect);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
      onPress={select}
      style={optionCardStyle(isSelected)}
    >
      <View style={[styles.optionIcon, isSelected && styles.optionIconSelected]}>
        <MaterialCommunityIcons
          color={isSelected ? colors.primaryStrong : colors.textMuted}
          name={option.icon}
          size={26}
        />
      </View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{option.label}</Text>
        <Text style={styles.optionDescription}>{option.description}</Text>
      </View>
      <View style={[styles.radio, isSelected && styles.radioSelected]}>
        {isSelected && <View style={styles.radioDot} />}
      </View>
    </Pressable>
  );
}

function ReviewStep({ draft }: { draft: GroupDraft }) {
  const access = accessOptions.find(
    (option) => option.visibility === draft.visibility && option.joinPolicy === draft.joinPolicy,
  );

  return (
    <View style={styles.step}>
      <StepIntro
        body="Everything look right? Create the group and start bringing your badminton community together."
        title="Ready to make it official?"
      />
      <LinearGradient
        colors={[colors.playAccentStrong, colors.primaryStrong, colors.energyAccent]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={styles.reviewHero}
      >
        {draft.photos[0] && (
          <>
            <Image source={{ uri: draft.photos[0].uri }} style={styles.reviewCoverImage} />
            <View style={styles.reviewCoverShade} />
          </>
        )}
        <View style={styles.reviewIcon}>
          <MaterialCommunityIcons color={colors.textInverse} name="badminton" size={34} />
        </View>
        <Text style={styles.reviewName}>{draft.name.trim()}</Text>
        <Text style={styles.reviewCity}>{draft.location?.label ?? draft.city.trim()}</Text>
      </LinearGradient>
      {draft.photos.length > 1 && (
        <ScrollView
          contentContainerStyle={styles.reviewPhotoStrip}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {draft.photos.map((photo, index) => (
            <View key={`${photo.uri}-review-${index}`} style={styles.reviewPhotoTile}>
              <Image source={{ uri: photo.uri }} style={styles.reviewPhotoImage} />
              {index === 0 && <Text style={styles.reviewCoverBadge}>Cover</Text>}
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.reviewCard}>
        <ReviewRow icon="earth" label="Sport" value="Badminton" />
        <ReviewRow
          icon="map-marker-outline"
          label="Area"
          value={draft.location?.label ?? draft.city.trim()}
        />
        <ReviewRow icon={access?.icon ?? 'earth'} label="Access" value={access?.label ?? 'Public and open'} />
        <ReviewRow icon="tag-multiple-outline" label="Tags" value={draft.goalTags.map(groupGoalLabel).join(', ')} />
        <ReviewRow
          icon="text-box-outline"
          label="About"
          value={draft.description.trim() || 'No description yet'}
        />
      </View>
    </View>
  );
}

function ReviewRow({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.reviewRow}>
      <MaterialCommunityIcons color={colors.primaryStrong} name={icon} size={21} />
      <View style={styles.reviewRowCopy}>
        <Text style={styles.reviewLabel}>{label}</Text>
        <Text style={styles.reviewValue}>{value}</Text>
      </View>
    </View>
  );
}

function StepIntro({ body, title }: { body: string; title: string }) {
  return (
    <View style={styles.intro}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

function FlowFooter({
  disabled,
  label,
  loading,
  onPress,
}: {
  disabled: boolean;
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerHint}>You can always change this later</Text>
      <Button disabled={disabled} loading={loading} onPress={onPress}>{label}</Button>
    </View>
  );
}

function CreationSuccess({
  group,
  onClose,
  onGetStarted,
}: {
  group: BadmintonGroup | null;
  onClose: () => void;
  onGetStarted: () => void;
}) {
  const coverUrl = resolveGroupCoverUrl(group?.image_urls?.[0] ?? group?.cover_image_url);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={group !== null}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.successCard}>
          <LinearGradient
            colors={[colors.playAccentSurface, colors.socialAccentSurface, colors.primarySurface]}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.successArt}
          >
            {coverUrl ? (
              <>
                <Image source={{ uri: coverUrl }} style={styles.successCoverImage} />
                <View style={styles.successCoverShade} />
              </>
            ) : (
              <>
                <View style={styles.successOrbLarge} />
                <View style={styles.successOrbSmall} />
                <MaterialCommunityIcons color={colors.playAccentStrong} name="account-group" size={78} />
                <MaterialCommunityIcons color={colors.energyAccentStrong} name="badminton" size={42} />
              </>
            )}
            <Pressable
              accessibilityLabel="Open group"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={styles.successClose}
            >
              <Ionicons color={colors.text} name="close" size={27} />
            </Pressable>
          </LinearGradient>
          <View style={styles.successCopy}>
            <Text accessibilityRole="header" style={styles.successTitle}>You created a group!</Text>
            <Text style={styles.successBody}>
              Invite your community, host a game, and make {group?.name ?? 'your new group'} yours.
            </Text>
            <Button onPress={onGetStarted}>Get started</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type CreateGroupFlow = ReturnType<typeof useCreateGroupFlow>;

function useCreateGroupFlow(initialCity: string, userId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isLocating, setIsLocating] = useState(false);
  const [draft, setDraft] = useState<GroupDraft>(() => ({
    city: initialCity,
    description: '',
    goalTags: [],
    joinPolicy: 'open',
    location: null,
    locationMode: null,
    name: '',
    photos: [],
    visibility: 'public',
  }));
  const [createdGroup, setCreatedGroup] = useState<BadmintonGroup | null>(null);

  const setName = useCallback((name: string) => {
    setDraft((current) => ({ ...current, name }));
  }, []);
  const setDescription = useCallback((description: string) => {
    setDraft((current) => ({ ...current, description }));
  }, []);
  const setLocationMode = useCallback((locationMode: GroupLocationMode) => {
    setDraft((current) => ({
      ...current,
      location: current.locationMode === locationMode ? current.location : null,
      locationMode,
    }));
  }, []);
  const setGoogleLocation = useCallback((location: SelectedLocation) => {
    setDraft((current) => ({
      ...current,
      city: location.city?.trim() || location.label,
      location,
      locationMode: 'search',
    }));
  }, []);
  const useCurrentLocation = useCallback(async () => {
    if (isLocating) return;
    setIsLocating(true);
    try {
      const current = await getCurrentLocation();
      const location: SelectedLocation = {
        address: current.city,
        city: current.city,
        label: `Near ${current.city}`,
        latitude: roughCoordinate(current.latitude),
        longitude: roughCoordinate(current.longitude),
        placeId: '',
      };
      setDraft((draft) => ({
        ...draft,
        city: current.city,
        location,
        locationMode: 'current',
      }));
    } catch (error) {
      Alert.alert(
        'Could not use your location',
        errorMessage(error, 'Check location permission or search for an area instead.'),
      );
    } finally {
      setIsLocating(false);
    }
  }, [isLocating]);
  const pickPhotos = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo access to add pictures to your group.');
        return;
      }
      const remaining = 5 - draft.photos.length;
      if (remaining <= 0) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 0.88,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      setDraft((current) => ({
        ...current,
        photos: [
          ...current.photos,
          ...result.assets.map((asset) => ({
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            uri: asset.uri,
          })),
        ].slice(0, 5),
      }));
    } catch (error) {
      Alert.alert('Could not choose pictures', errorMessage(error, 'Please try another photo.'));
    }
  }, [draft.photos.length]);
  const removePhoto = useCallback((index: number) => {
    setDraft((current) => ({
      ...current,
      photos: current.photos.filter((_, photoIndex) => photoIndex !== index),
    }));
  }, []);
  const toggleGoal = useCallback((goal: GroupGoal) => {
    setDraft((current) => {
      if (current.goalTags.includes(goal)) {
        return { ...current, goalTags: current.goalTags.filter((item) => item !== goal) };
      }
      if (current.goalTags.length >= 3) {
        return current;
      }
      return { ...current, goalTags: [...current.goalTags, goal] };
    });
  }, []);
  const setAccess = useCallback((option: AccessOption) => {
    setDraft((current) => ({
      ...current,
      joinPolicy: option.joinPolicy,
      visibility: option.visibility,
    }));
  }, []);
  const create = useCallback(
    () => createGroup(draft, userId),
    [draft, userId],
  );
  const handleSuccess = useCallback(
    (group: BadmintonGroup) => {
      setCreatedGroup(group);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        queryClient.invalidateQueries({ queryKey: ['groups', 'mine', userId] }),
      ]);
    },
    [queryClient, userId],
  );
  const mutation = useMutation({
    mutationFn: create,
    onError: showCreationError,
    onSuccess: handleSuccess,
  });
  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }, [router]);
  const goBack = useCallback(() => {
    setStep((current) => Math.max(0, current - 1));
  }, []);
  const continueFlow = useCallback(() => {
    if (step < stepCount - 1) {
      setStep((current) => Math.min(stepCount - 1, current + 1));
      return;
    }
    mutation.mutate();
  }, [mutation, step]);
  const finish = useCallback(() => {
    if (!createdGroup) return;
    router.replace({
      pathname: '/groups/[groupId]',
      params: { groupId: createdGroup.id },
    });
  }, [createdGroup, router]);
  const canContinue = useMemo(() => {
    if (step === 1) return draft.goalTags.length > 0;
    if (step === 2) {
      return draft.name.trim().length > 0
        && draft.city.trim().length > 0
        && draft.location !== null;
    }
    return true;
  }, [draft.city, draft.goalTags.length, draft.name, step]);

  return {
    canContinue,
    close,
    continueFlow,
    createdGroup,
    draft,
    finish,
    goBack,
    isCreating: mutation.isPending,
    isLocating,
    pickPhotos,
    removePhoto,
    setAccess,
    setDescription,
    setGoogleLocation,
    setLocationMode,
    setName,
    step,
    toggleGoal,
    useCurrentLocation,
  };
}

async function createGroup(draft: GroupDraft, userId: string) {
  if (!userId) {
    throw new Error('Sign in again before creating a group.');
  }
  const imageKeys = await Promise.all(draft.photos.map((photo, index) => uploadImage({
    failureLabel: `Group picture ${index + 1}`,
    mimeType: photo.mimeType,
    purpose: 'group_cover',
    uri: photo.uri,
    userId,
  })));
  const body: CreateBadmintonGroup = {
    city: draft.city.trim(),
    cover_image_key: imageKeys[0] ?? null,
    description: draft.description.trim() || null,
    goal_tags: draft.goalTags,
    google_place_id: draft.location?.placeId || null,
    image_keys: imageKeys,
    join_policy: draft.joinPolicy,
    latitude: draft.location?.latitude ?? null,
    location_label: draft.location?.label ?? null,
    longitude: draft.location?.longitude ?? null,
    name: draft.name.trim(),
    primary_court_id: null,
    visibility: draft.visibility,
  };
  return apiData<BadmintonGroup>(postApiGroups({
    body,
    headers: authHeaders(userId),
  }));
}

function showCreationError(error: unknown) {
  Alert.alert('Could not create group', errorMessage(error, 'Please check your details and try again.'));
}

function useGoalSelection(goal: GroupGoal, onToggle: (goal: GroupGoal) => void) {
  return useCallback(() => {
    onToggle(goal);
  }, [goal, onToggle]);
}

function useAccessSelection(option: AccessOption, onSelect: (option: AccessOption) => void) {
  return useCallback(() => {
    onSelect(option);
  }, [onSelect, option]);
}

function usePhotoRemoval(index: number, onRemove: (index: number) => void) {
  return useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);
}

function useLocationModeSelection(
  mode: GroupLocationMode,
  onSelect: (mode: GroupLocationMode) => void,
) {
  return useCallback(() => {
    onSelect(mode);
  }, [mode, onSelect]);
}

function roughCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

function groupGoalLabel(goal: GroupGoal) {
  switch (goal) {
    case 'social': return 'Just for fun';
    case 'improvement': return 'Get better';
    case 'fitness': return 'Stay active';
    case 'competitive': return 'Compete';
    case 'consistent_play': return 'Play consistently';
  }
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function headerButtonStyle({ pressed }: PressableStateCallbackType) {
  return [styles.headerButton, pressed && styles.pressed];
}

function optionCardStyle(isSelected: boolean) {
  return ({ pressed }: PressableStateCallbackType) => [
    styles.optionCard,
    isSelected && styles.optionCardSelected,
    pressed && styles.optionCardPressed,
  ];
}

function coverPickerStyle({ pressed }: PressableStateCallbackType) {
  return [styles.coverPicker, pressed && styles.optionCardPressed];
}

function addPhotoTileStyle({ pressed }: PressableStateCallbackType) {
  return [styles.addPhotoTile, pressed && styles.optionCardPressed];
}

function locationChoiceStyle(isSelected: boolean) {
  return ({ pressed }: PressableStateCallbackType) => [
    styles.locationChoice,
    isSelected && styles.locationChoiceSelected,
    pressed && styles.optionCardPressed,
  ];
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  keyboardView: { flex: 1 },
  header: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 2,
  },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerButton: {
    alignItems: 'center',
    borderRadius: 99,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  headerStep: {
    color: colors.textMuted,
    flex: 1,
    fontFamily: fonts.black,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    textAlign: 'center',
  },
  progress: { flexDirection: 'row', gap: 5, marginTop: 8 },
  progressSegment: { backgroundColor: colors.border, borderRadius: 99, flex: 1, height: 5 },
  progressSegmentActive: { backgroundColor: colors.primaryStrong },
  scrollContent: { flexGrow: 1, paddingBottom: 32 },
  step: { gap: 24, paddingHorizontal: 20, paddingTop: 32 },
  intro: { gap: 10 },
  title: {
    color: colors.text,
    fontFamily: fonts.black,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.7,
    lineHeight: 38,
  },
  body: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  selectionCount: {
    alignSelf: 'flex-end',
    color: colors.primaryStrong,
    fontFamily: fonts.black,
    fontSize: 11,
    fontWeight: '900',
  },
  optionList: { gap: 12 },
  optionCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.transparent,
    borderRadius: 20,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 13,
    minHeight: 94,
    padding: 16,
  },
  optionCardSelected: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
  optionCardPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 15,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  optionIconSelected: { backgroundColor: colors.surface },
  optionCopy: { flex: 1, gap: 3 },
  optionTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 16, fontWeight: '900' },
  optionDescription: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: 7,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  checkboxSelected: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  radio: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: 99,
    borderWidth: 2,
    height: 29,
    justifyContent: 'center',
    width: 29,
  },
  radioSelected: { borderColor: colors.primaryStrong },
  radioDot: { backgroundColor: colors.primaryStrong, borderRadius: 99, height: 15, width: 15 },
  tipCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.socialAccentSurface,
    borderColor: colors.socialAccent,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  tipText: { color: colors.socialAccentStrong, flex: 1, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  fields: { gap: 9 },
  fieldLabel: { color: colors.text, fontFamily: fonts.black, fontSize: 13, fontWeight: '900', marginTop: 6 },
  required: { color: colors.danger },
  coverField: { gap: 10 },
  coverHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  coverHeadingCopy: { flex: 1, gap: 2 },
  coverHint: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  photoCount: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 12, fontWeight: '900' },
  coverPicker: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 190,
    overflow: 'hidden',
  },
  coverPreview: { height: '100%', width: '100%' },
  coverPreviewShade: {
    backgroundColor: colors.imageOverlay,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  coverReplaceBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.overlayStrong,
    borderRadius: 99,
    bottom: 14,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    position: 'absolute',
  },
  coverReplaceText: { color: colors.textInverse, fontFamily: fonts.black, fontSize: 11, fontWeight: '900' },
  coverEmpty: { alignItems: 'center', flex: 1, gap: 7, justifyContent: 'center', padding: 22 },
  coverEmptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderRadius: 99,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  coverEmptyTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 15, fontWeight: '900' },
  coverEmptyBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    maxWidth: 250,
    textAlign: 'center',
  },
  photoStrip: { gap: 10, paddingRight: 2 },
  photoTile: {
    borderRadius: 17,
    height: 132,
    overflow: 'hidden',
    position: 'relative',
    width: 132,
  },
  photoTileImage: { height: '100%', width: '100%' },
  coverBadge: {
    backgroundColor: colors.primaryStrong,
    borderRadius: 99,
    color: colors.textInverse,
    fontFamily: fonts.black,
    fontSize: 9,
    fontWeight: '900',
    left: 8,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'absolute',
    top: 8,
  },
  removePhotoButton: {
    alignItems: 'center',
    backgroundColor: colors.overlayStrong,
    borderRadius: 99,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: 7,
    top: 7,
    width: 28,
  },
  addPhotoTile: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
    borderRadius: 17,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 4,
    height: 132,
    justifyContent: 'center',
    width: 112,
  },
  addPhotoText: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 10, fontWeight: '900' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 15,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 15,
    minHeight: 54,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  textArea: { minHeight: 132 },
  characterCount: { color: colors.textSubtle, fontFamily: fonts.medium, fontSize: 10, textAlign: 'right' },
  locationField: { gap: 10, marginTop: 5 },
  locationTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  locationPrivacy: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  locationChoices: { gap: 9 },
  locationChoice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 78,
    padding: 13,
  },
  locationChoiceSelected: { backgroundColor: colors.primarySurface, borderColor: colors.primaryStrong },
  locationChoiceCopy: { flex: 1, gap: 2 },
  locationChoiceLabel: { color: colors.text, fontFamily: fonts.black, fontSize: 14, fontWeight: '900' },
  locationChoiceDescription: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  selectedLocation: {
    alignItems: 'center',
    backgroundColor: colors.primarySurface,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    padding: 12,
  },
  selectedLocationCopy: { flex: 1, gap: 2, minWidth: 0 },
  selectedLocationLabel: { color: colors.text, fontFamily: fonts.black, fontSize: 13, fontWeight: '900' },
  selectedLocationAddress: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 10 },
  reviewHero: { borderRadius: 24, gap: 7, minHeight: 195, padding: 20 },
  reviewCoverImage: { height: '100%', left: 0, position: 'absolute', top: 0, width: '100%' },
  reviewCoverShade: { backgroundColor: colors.overlayStrong, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  reviewPhotoStrip: { gap: 9, paddingRight: 2 },
  reviewPhotoTile: { borderRadius: 13, height: 78, overflow: 'hidden', position: 'relative', width: 102 },
  reviewPhotoImage: { height: '100%', width: '100%' },
  reviewCoverBadge: {
    backgroundColor: colors.primaryStrong,
    borderRadius: 99,
    bottom: 6,
    color: colors.textInverse,
    fontFamily: fonts.black,
    fontSize: 8,
    fontWeight: '900',
    left: 6,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 3,
    position: 'absolute',
  },
  reviewIcon: {
    alignItems: 'center',
    backgroundColor: colors.imageOverlay,
    borderRadius: 18,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  reviewName: { color: colors.textInverse, fontFamily: fonts.black, fontSize: 27, fontWeight: '900', marginTop: 'auto' },
  reviewCity: { color: colors.imageOverlayText, fontFamily: fonts.bold, fontSize: 13, fontWeight: '700' },
  reviewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 17,
  },
  reviewRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 15,
  },
  reviewRowCopy: { flex: 1, gap: 2 },
  reviewLabel: { color: colors.textSubtle, fontFamily: fonts.black, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  reviewValue: { color: colors.text, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  footer: {
    backgroundColor: colors.surfaceOverlay,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 9,
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  footerHint: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11, textAlign: 'center' },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: colors.overlayStrong,
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: 26,
    maxWidth: 420,
    overflow: 'hidden',
    width: '100%',
  },
  successArt: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    height: 220,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  successCoverImage: { height: '100%', left: 0, position: 'absolute', top: 0, width: '100%' },
  successCoverShade: { backgroundColor: colors.imageOverlay, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  successOrbLarge: {
    backgroundColor: colors.secondarySurface,
    borderRadius: 999,
    height: 180,
    left: -45,
    position: 'absolute',
    top: -35,
    width: 180,
  },
  successOrbSmall: {
    backgroundColor: colors.socialAccentSurface,
    borderRadius: 999,
    bottom: -45,
    height: 140,
    position: 'absolute',
    right: -25,
    width: 140,
  },
  successClose: {
    alignItems: 'center',
    backgroundColor: colors.surfaceOverlay,
    borderRadius: 99,
    height: 46,
    justifyContent: 'center',
    position: 'absolute',
    right: 14,
    top: 14,
    width: 46,
  },
  successCopy: { gap: 14, padding: 24 },
  successTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 25, fontWeight: '900' },
  successBody: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  pressed: { backgroundColor: colors.surfaceMuted, opacity: 0.7 },
});
