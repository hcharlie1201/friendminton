import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiUsersById, patchApiUsersMe, type Player, type UpdateProfile } from '../api/generated';
import { apiData } from '../api/runtime';
import { useSession } from '../auth/session';
import { errorMessage } from '../common/errors';
import { Button, TextField, colors, fonts } from '../components/ui';
import { profileImageUrl } from '../features/profile/profileImage';
import { uploadImage } from '../features/uploads/uploadImage';

const skillLevels = ['beginner', 'intermediate', 'advanced', 'competitive'] as const;
type SkillLevel = typeof skillLevels[number];
type Draft = UpdateProfile & { avatarUri: string | null };

export function EditProfileScreen() {
  const { updateUser, user } = useSession();
  if (!user) throw new Error('EditProfileScreen requires an authenticated session');
  const queryClient = useQueryClient();
  const router = useRouter();
  const profile = useQuery({
    queryKey: ['players', 'profile', user.id],
    queryFn: () => apiData<Player>(getApiUsersById({ path: { id: user.id } })),
  });
  const editor = useProfileEditor(user.id, profile.data, queryClient, updateUser, router.back);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close profile editor" hitSlop={10} onPress={editor.close} style={styles.headerButton}>
          <Ionicons color={colors.text} name="close" size={27} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit profile</Text>
        <View style={styles.headerButton} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityLabel="Choose profile photo" accessibilityRole="button" onPress={editor.chooseAvatar} style={styles.avatarButton}>
            {editor.avatarUrl ? <Image source={{ uri: editor.avatarUrl }} style={styles.avatarImage} /> : (
              <View style={styles.avatarFallback}><Ionicons color={colors.textOnPrimary} name="camera" size={30} /></View>
            )}
            <Text style={styles.changePhoto}>Change photo</Text>
          </Pressable>
          <Field label="Display name"><TextField maxLength={60} onChangeText={editor.setDisplayName} value={editor.draft.display_name} /></Field>
          <Field label="City"><TextField maxLength={100} onChangeText={editor.setCity} value={editor.draft.city ?? ''} /></Field>
          <View style={styles.field}>
            <Text style={styles.label}>Skill level</Text>
            <View style={styles.skills}>{skillLevels.map((level) => <SkillButton key={level} level={level} onSelect={editor.selectSkill} selected={editor.draft.skill_level === level} />)}</View>
          </View>
          <Field label="Bio"><TextField maxLength={500} multiline onChangeText={editor.setBio} style={styles.bioInput} textAlignVertical="top" value={editor.draft.bio ?? ''} /></Field>
          <Button disabled={editor.isSaving || !editor.isValid} onPress={editor.save}>{editor.isSaving ? 'Saving…' : 'Save profile'}</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useProfileEditor(userId: string, profile: Player | undefined, queryClient: ReturnType<typeof useQueryClient>, updateUser: (user: Pick<Player, 'display_name' | 'city'>) => Promise<void>, close: () => void) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  useEffect(() => { if (profile) setDraft(draftFromProfile(profile)); }, [profile]);
  const mutation = useMutation({
    mutationFn: async () => {
      const avatarKey = draft.avatarUri ? await uploadImage({ failureLabel: 'Avatar', mimeType: null, purpose: 'avatar', uri: draft.avatarUri, userId }) : draft.avatar_key;
      return apiData<Player>(patchApiUsersMe({ body: { display_name: draft.display_name, city: draft.city, skill_level: draft.skill_level, bio: draft.bio, avatar_key: avatarKey } }));
    },
    onError: (error) => Alert.alert('Could not save profile', errorMessage(error)),
    onSuccess: async (saved) => {
      await updateUser(saved);
      queryClient.setQueryData(['players', 'profile', userId], saved);
      await queryClient.invalidateQueries({ queryKey: ['players'] });
      close();
    },
  });
  const chooseAvatar = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], mediaTypes: ['images'], quality: 0.85 });
    if (!result.canceled) setDraft((value) => ({ ...value, avatarUri: result.assets[0]?.uri ?? null }));
  }, []);
  const setDisplayName = useCallback((display_name: string) => setDraft((value) => ({ ...value, display_name })), []);
  const setCity = useCallback((city: string) => setDraft((value) => ({ ...value, city })), []);
  const setBio = useCallback((bio: string) => setDraft((value) => ({ ...value, bio })), []);
  const selectSkill = useCallback((skill_level: SkillLevel) => setDraft((value) => ({ ...value, skill_level })), []);
  const save = useCallback(() => mutation.mutate(), [mutation]);
  const avatarUrl = draft.avatarUri ?? profileImageUrl(profile?.avatar_url);
  return { avatarUrl, chooseAvatar, close, draft, isSaving: mutation.isPending, isValid: draft.display_name.trim().length > 0, save, selectSkill, setBio, setCity, setDisplayName };
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>; }
function SkillButton({ level, onSelect, selected }: { level: SkillLevel; onSelect: (level: SkillLevel) => void; selected: boolean }) {
  const press = useCallback(() => onSelect(level), [level, onSelect]);
  return <Pressable onPress={press} style={[styles.skill, selected && styles.skillSelected]}><Text style={[styles.skillText, selected && styles.skillTextSelected]}>{level[0]?.toUpperCase()}{level.slice(1)}</Text></Pressable>;
}
function draftFromProfile(profile: Player): Draft { return { avatar_key: profile.avatar_key, avatarUri: null, bio: profile.bio, city: profile.city, display_name: profile.display_name, skill_level: profile.skill_level }; }
const emptyDraft: Draft = { avatar_key: null, avatarUri: null, bio: null, city: null, display_name: '', skill_level: 'beginner' };

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 }, flex: { flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 14 },
  headerButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 }, headerTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' },
  content: { gap: 20, padding: 20, paddingBottom: 60 }, avatarButton: { alignItems: 'center', gap: 8 },
  avatarFallback: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 52, height: 104, justifyContent: 'center', width: 104 },
  avatarImage: { borderRadius: 52, height: 104, width: 104 }, changePhoto: { color: colors.primaryStrong, fontFamily: fonts.bold, fontSize: 14, fontWeight: '700' },
  field: { gap: 8 }, label: { color: colors.text, fontFamily: fonts.bold, fontSize: 14, fontWeight: '700' }, bioInput: { minHeight: 120, paddingTop: 14 },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, skill: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 99, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  skillSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, skillText: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 12, fontWeight: '700' }, skillTextSelected: { color: colors.textOnPrimary },
});
