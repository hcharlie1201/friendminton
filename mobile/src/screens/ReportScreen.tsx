import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { postApiModerationReports, type ReportReason, type ReportTargetType } from '../api/generated';
import { apiData } from '../api/runtime';
import { errorMessage } from '../common/errors';
import { Button, TextField, colors, fonts } from '../components/ui';

const reasons: { label: string; value: ReportReason }[] = [
  { label: 'Harassment', value: 'harassment' }, { label: 'Spam', value: 'spam' },
  { label: 'Hate speech', value: 'hate' }, { label: 'Sexual content', value: 'sexual_content' },
  { label: 'Violence', value: 'violence' }, { label: 'Something else', value: 'other' },
];

export function ReportScreen() {
  const params = useLocalSearchParams<{ targetId?: string; targetType?: ReportTargetType; label?: string }>();
  const router = useRouter();
  const form = useReportForm(params.targetId ?? '', params.targetType === 'post' ? 'post' : 'user', router.back);
  return (
    <SafeAreaView style={styles.screen}><StatusBar style="dark" />
      <View style={styles.header}><Pressable accessibilityLabel="Close report" onPress={form.close} style={styles.headerButton}><Ionicons color={colors.text} name="close" size={27} /></Pressable><Text style={styles.headerTitle}>Report</Text><View style={styles.headerButton} /></View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>What’s happening with {params.label ?? 'this content'}?</Text>
          <Text style={styles.body}>Reports are private. A moderator will review the context and take action when needed.</Text>
          <View style={styles.reasons}>{reasons.map((reason) => <ReasonButton key={reason.value} onSelect={form.selectReason} reason={reason} selected={form.reason === reason.value} />)}</View>
          <Text style={styles.label}>Extra details (optional)</Text>
          <TextField maxLength={1000} multiline onChangeText={form.setDetails} placeholder="Help the moderator understand what happened" style={styles.details} textAlignVertical="top" value={form.details} />
          <Button disabled={!form.reason || form.isSaving} onPress={form.submit}>{form.isSaving ? 'Sending…' : 'Send report'}</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useReportForm(targetId: string, targetType: ReportTargetType, close: () => void) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const mutation = useMutation({ mutationFn: () => apiData(postApiModerationReports({ body: { details: details.trim() || null, reason: reason ?? 'other', target_id: targetId, target_type: targetType } })), onError: (error) => Alert.alert('Could not send report', errorMessage(error)), onSuccess: () => Alert.alert('Report sent', 'Thanks for helping keep Friendminton safe.', [{ text: 'Done', onPress: close }]) });
  const selectReason = useCallback((value: ReportReason) => setReason(value), []);
  const submit = useCallback(() => mutation.mutate(), [mutation]);
  return { close, details, isSaving: mutation.isPending, reason, selectReason, setDetails, submit };
}

function ReasonButton({ onSelect, reason, selected }: { onSelect: (value: ReportReason) => void; reason: { label: string; value: ReportReason }; selected: boolean }) {
  const press = useCallback(() => onSelect(reason.value), [onSelect, reason.value]);
  return <Pressable onPress={press} style={[styles.reason, selected && styles.reasonSelected]}><Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{reason.label}</Text>{selected && <Ionicons color={colors.textOnPrimary} name="checkmark-circle" size={20} />}</Pressable>;
}

const styles = StyleSheet.create({ screen: { backgroundColor: colors.background, flex: 1 }, flex: { flex: 1 }, header: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 14 }, headerButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 }, headerTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' }, content: { gap: 16, padding: 20, paddingBottom: 60 }, title: { color: colors.text, fontFamily: fonts.black, fontSize: 22, fontWeight: '900' }, body: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 }, reasons: { gap: 8 }, reason: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 15 }, reasonSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, reasonText: { color: colors.text, fontFamily: fonts.bold, fontSize: 15, fontWeight: '700' }, reasonTextSelected: { color: colors.textOnPrimary }, label: { color: colors.text, fontFamily: fonts.bold, fontSize: 14, fontWeight: '700' }, details: { minHeight: 120, paddingTop: 14 } });
