import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiModerationAuditLog, getApiModerationReports, patchApiModerationReportsByReportId, type ModerationAuditEntry, type ModerationReport, type ReportResolution } from '../api/generated';
import { apiData } from '../api/runtime';
import { errorMessage } from '../common/errors';
import { Button, colors, fonts } from '../components/ui';

export function ModerationScreen() {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);
  const reports = useQuery({ queryKey: ['moderation', 'reports'], queryFn: () => apiData<ModerationReport[]>(getApiModerationReports()) });
  const audit = useQuery({ queryKey: ['moderation', 'audit'], queryFn: () => apiData<ModerationAuditEntry[]>(getApiModerationAuditLog()) });
  return <SafeAreaView style={styles.screen}><StatusBar style="dark" />
    <View style={styles.header}><Pressable accessibilityLabel="Close moderation" onPress={close} style={styles.headerButton}><Ionicons color={colors.text} name="chevron-back" size={28} /></Pressable><Text style={styles.headerTitle}>Safety review</Text><View style={styles.headerButton} /></View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Open reports</Text>
      {reports.isPending ? <ActivityIndicator color={colors.primary} /> : reports.data?.length ? reports.data.map((report) => <ReportCard key={report.id} report={report} />) : <Text style={styles.empty}>No open reports. Nice.</Text>}
      <Text style={styles.sectionTitle}>Audit trail</Text>
      {audit.data?.length ? audit.data.map((entry) => <AuditRow entry={entry} key={entry.id} />) : <Text style={styles.empty}>No moderation actions yet.</Text>}
    </ScrollView>
  </SafeAreaView>;
}

function ReportCard({ report }: { report: ModerationReport }) {
  const action = useReportReview(report);
  return <View style={styles.card}><View style={styles.cardHeader}><Text style={styles.reason}>{reasonLabel(report.reason)}</Text><Text style={styles.targetType}>{report.target_type.toUpperCase()}</Text></View><Text style={styles.target}>{report.target_label || 'Removed content'}</Text><Text style={styles.meta}>Reported by {report.reporter_name}</Text>{report.details ? <Text style={styles.details}>{report.details}</Text> : null}<View style={styles.actions}>{report.target_type !== 'user' && <Button onPress={action.remove} variant="danger">Remove</Button>}<Button onPress={action.resolve} variant="secondary">Resolve</Button><Button onPress={action.dismiss} variant="secondary">Dismiss</Button></View></View>;
}

function useReportReview(report: ModerationReport) {
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: (resolution: ReportResolution) => apiData(patchApiModerationReportsByReportId({ body: { note: null, resolution }, path: { report_id: report.id } })), onError: (error) => Alert.alert('Could not review report', errorMessage(error)), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['moderation'] }), queryClient.invalidateQueries({ queryKey: ['feed'] })]); } });
  const dismiss = useCallback(() => mutation.mutate('dismiss'), [mutation]);
  const resolve = useCallback(() => mutation.mutate('resolve'), [mutation]);
  const remove = useCallback(() => Alert.alert('Remove this activity?', 'It will disappear from the feed and the action will be recorded.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => mutation.mutate('remove_content') }]), [mutation]);
  return { dismiss, remove, resolve };
}

function AuditRow({ entry }: { entry: ModerationAuditEntry }) { return <View style={styles.audit}><Ionicons color={colors.textMuted} name="shield-checkmark-outline" size={18} /><View style={styles.auditCopy}><Text style={styles.auditAction}>{entry.action.replaceAll('_', ' ')}</Text><Text style={styles.meta}>{entry.target_type} · {new Date(entry.created_at).toLocaleDateString()}</Text></View></View>; }
function reasonLabel(reason: ModerationReport['reason']) { return reason.replaceAll('_', ' ').replace(/\b\w/g, (value) => value.toUpperCase()); }

const styles = StyleSheet.create({ screen: { backgroundColor: colors.background, flex: 1 }, header: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 14 }, headerButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42 }, headerTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 18, fontWeight: '900' }, content: { gap: 14, padding: 20, paddingBottom: 60 }, sectionTitle: { color: colors.text, fontFamily: fonts.black, fontSize: 20, fontWeight: '900', marginTop: 8 }, empty: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, paddingVertical: 18 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 9, padding: 16 }, cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, reason: { color: colors.text, fontFamily: fonts.black, fontSize: 16, fontWeight: '900' }, targetType: { color: colors.primaryStrong, fontFamily: fonts.black, fontSize: 10, fontWeight: '900' }, target: { color: colors.text, fontFamily: fonts.bold, fontSize: 14, fontWeight: '700' }, meta: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 12 }, details: { color: colors.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 }, actions: { gap: 8, marginTop: 6 }, audit: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, flexDirection: 'row', gap: 10, padding: 12 }, auditCopy: { flex: 1, gap: 2 }, auditAction: { color: colors.text, fontFamily: fonts.bold, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' } });
