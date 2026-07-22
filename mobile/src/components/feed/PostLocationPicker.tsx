import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PostDraft } from '../../features/posts/postDraft';
import { LocationAutocomplete, type SelectedLocation } from '../location';
import { colors, fonts } from '../ui';

type Props = {
  draft: PostDraft;
  onChange: (draft: PostDraft) => void;
};

export function PostLocationPicker({ draft, onChange }: Props) {
  const picker = usePostLocationPicker(draft, onChange);
  if (!picker.visible) {
    return (
      <Pressable accessibilityRole="button" onPress={picker.open} style={styles.tool}>
        <Ionicons color={colors.primaryStrong} name="location-outline" size={19} />
        <Text style={styles.toolLabel}>Add location</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.container}>
      <LocationAutocomplete
        initialText={draft.location}
        onSelect={picker.select}
        placeholder="Search for a court or place"
        value={null}
      />
      <Pressable accessibilityRole="button" onPress={picker.remove} style={styles.remove}>
        <Ionicons color={colors.textMuted} name="close-circle" size={18} />
        <Text style={styles.removeText}>Remove location</Text>
      </Pressable>
    </View>
  );
}

function usePostLocationPicker(draft: PostDraft, onChange: Props['onChange']) {
  const [visible, setVisible] = useState(Boolean(draft.location));
  const open = useCallback(() => setVisible(true), []);
  const remove = useCallback(() => {
    onChange({ ...draft, location: '' });
    setVisible(false);
  }, [draft, onChange]);
  const select = useCallback((location: SelectedLocation) => {
    onChange({ ...draft, location: location.label });
  }, [draft, onChange]);
  return { open, remove, select, visible };
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  tool: { alignItems: 'center', backgroundColor: colors.primarySurface, borderColor: colors.borderStrong, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 40, paddingHorizontal: 11 },
  toolLabel: { color: colors.primaryStrong, fontFamily: fonts.extraBold, fontSize: 12, fontWeight: '800' },
  remove: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 4, padding: 4 },
  removeText: { color: colors.textMuted, fontFamily: fonts.medium, fontSize: 11 },
});
