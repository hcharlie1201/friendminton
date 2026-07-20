import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { PostDraft } from '../../features/posts/postDraft';
import { Button, TextField, colors, fonts } from '../ui';

const effortOptions = [
  { label: 'Easy', value: 3 },
  { label: 'Steady', value: 5 },
  { label: 'Hard', value: 7 },
  { label: 'All out', value: 10 },
] as const;

type Props = {
  allowEmpty?: boolean;
  contextLabel?: string;
  draft: PostDraft;
  eyebrow?: string;
  isEditing: boolean;
  isSaving: boolean;
  onCancelEdit: () => void;
  onChange: (draft: PostDraft) => void;
  onSubmit: () => void;
  submitLabel?: string;
  title?: string;
};

export function PostComposer({
  allowEmpty = false,
  contextLabel,
  draft,
  eyebrow,
  isEditing,
  isSaving,
  onCancelEdit,
  onChange,
  onSubmit,
  submitLabel,
  title,
}: Props) {
  const canSubmit = allowEmpty || Boolean(draft.body.trim() || draft.photos.length);

  return (
    <View style={styles.composer}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.eyebrow}>{eyebrow ?? (isEditing ? 'EDIT ACTIVITY' : 'NEW ACTIVITY')}</Text>
          <Text style={styles.title}>{title ?? (isEditing ? 'Make it feel right' : 'How did you play?')}</Text>
          {contextLabel && <Text style={styles.context}>{contextLabel}</Text>}
        </View>
        {isEditing && (
          <Pressable accessibilityLabel="Cancel editing" hitSlop={10} onPress={onCancelEdit}>
            <Ionicons color={colors.muted} name="close" size={24} />
          </Pressable>
        )}
      </View>

      <TextField
        multiline
        onChangeText={(body) => onChange({ ...draft, body })}
        placeholder="Share a match, practice, or small win..."
        style={styles.bodyInput}
        textAlignVertical="top"
        value={draft.body}
        variant="compact"
      />

      {draft.photos.length > 0 && (
        <ScrollView horizontal contentContainerStyle={styles.photoStrip} showsHorizontalScrollIndicator={false}>
          {draft.photos.map((photo, index) => (
            <View key={`${photo.uri}-${index}`} style={styles.photoFrame}>
              <Image source={{ uri: photo.uri }} style={styles.photo} />
              <Pressable
                accessibilityLabel="Remove photo"
                onPress={() => onChange({ ...draft, photos: draft.photos.filter((_, photoIndex) => photoIndex !== index) })}
                style={styles.removePhoto}
              >
                <Ionicons color="#FFFFFF" name="close" size={16} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.tools}>
        <ToolButton
          disabled={draft.photos.length >= 4}
          icon="images-outline"
          label={draft.photos.length ? `${draft.photos.length}/4 photos` : 'Add photos'}
          onPress={() => void pickPhotos(draft, onChange)}
        />
        <ToolButton icon="location-outline" label="Add location" onPress={() => void useCurrentLocation(draft, onChange)} />
      </View>

      {draft.location.length > 0 && (
        <View style={styles.locationRow}>
          <Ionicons color={colors.primary} name="location" size={18} />
          <TextField
            onChangeText={(location) => onChange({ ...draft, location })}
            placeholder="Court or neighborhood"
            style={styles.locationInput}
            value={draft.location}
            variant="compact"
          />
          <Pressable accessibilityLabel="Remove location" hitSlop={8} onPress={() => onChange({ ...draft, location: '' })}>
            <Ionicons color={colors.muted} name="close-circle" size={20} />
          </Pressable>
        </View>
      )}

      <View style={styles.effortSection}>
        <Text style={styles.fieldLabel}>MATCH EFFORT</Text>
        <View style={styles.effortControl}>
          {effortOptions.map((option) => {
            const active = draft.effort === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onChange({ ...draft, effort: active ? null : option.value })}
                style={[styles.effortOption, active && styles.effortOptionActive]}
              >
                <Text style={[styles.effortLabel, active && styles.effortLabelActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button disabled={!canSubmit} icon={isEditing ? 'checkmark' : 'paper-plane'} loading={isSaving} onPress={onSubmit}>
        {submitLabel ?? (isEditing ? 'Save changes' : 'Post activity')}
      </Button>
    </View>
  );
}

function ToolButton({ disabled = false, icon, label, onPress }: { disabled?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.tool, pressed && styles.toolPressed, disabled && styles.toolDisabled]}>
      <Ionicons color={colors.primaryDark} name={icon} size={19} />
      <Text style={styles.toolLabel}>{label}</Text>
    </Pressable>
  );
}

async function pickPhotos(draft: PostDraft, onChange: (draft: PostDraft) => void) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Photo access needed', 'Allow photo access to add pictures to your activity.');
    return;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: true,
    mediaTypes: ['images'],
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    quality: 0.85,
    selectionLimit: 4 - draft.photos.length,
  });

  if (!result.canceled) {
    onChange({
      ...draft,
      photos: [
        ...draft.photos,
        ...result.assets.map((asset) => ({ fileName: asset.fileName, mimeType: asset.mimeType, uri: asset.uri })),
      ].slice(0, 4),
    });
  }
}

async function useCurrentLocation(draft: PostDraft, onChange: (draft: PostDraft) => void) {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Location access needed', 'Allow location access or type a location manually.');
      onChange({ ...draft, location: ' ' });
      return;
    }

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const [place] = await Location.reverseGeocodeAsync(position.coords);
    const label = [place?.name, place?.city ?? place?.subregion].filter(Boolean).join(', ');
    onChange({ ...draft, location: label || 'Current location' });
  } catch {
    Alert.alert('Friendminton', 'Could not read your current location. You can type it instead.');
    onChange({ ...draft, location: ' ' });
  }
}

const styles = StyleSheet.create({
  composer: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    shadowColor: '#0B3B75',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: colors.primary, fontFamily: fonts.black, fontSize: 10, fontWeight: '900' },
  title: { color: colors.ink, fontFamily: fonts.black, fontSize: 20, fontWeight: '900' },
  context: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, fontWeight: '700', marginTop: 2 },
  bodyInput: { fontSize: 16, lineHeight: 23, minHeight: 88, paddingTop: 8 },
  photoStrip: { gap: 8 },
  photoFrame: { borderRadius: 8, height: 116, overflow: 'hidden', width: 116 },
  photo: { height: '100%', width: '100%' },
  removePhoto: { alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.78)', borderRadius: 14, height: 26, justifyContent: 'center', position: 'absolute', right: 6, top: 6, width: 26 },
  tools: { flexDirection: 'row', gap: 8 },
  tool: { alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: '#B9D8FF', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 40, paddingHorizontal: 11 },
  toolPressed: { backgroundColor: '#D9EAFF' },
  toolDisabled: { opacity: 0.45 },
  toolLabel: { color: colors.primaryDark, fontFamily: fonts.extraBold, fontSize: 12, fontWeight: '800' },
  locationRow: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 8, flexDirection: 'row', gap: 6, paddingHorizontal: 10 },
  locationInput: { backgroundColor: 'transparent', flex: 1, paddingHorizontal: 4 },
  effortSection: { gap: 7 },
  fieldLabel: { color: colors.muted, fontFamily: fonts.black, fontSize: 10, fontWeight: '900' },
  effortControl: { backgroundColor: colors.background, borderRadius: 8, flexDirection: 'row', padding: 3 },
  effortOption: { alignItems: 'center', borderRadius: 6, flex: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 4 },
  effortOptionActive: { backgroundColor: colors.primary, shadowColor: colors.primaryDark, shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 2 },
  effortLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 11, fontWeight: '700' },
  effortLabelActive: { color: '#FFFFFF', fontFamily: fonts.black, fontWeight: '900' },
});
