import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../ui';

type PickerTarget = 'start_date' | 'start_time' | 'end_date' | 'end_time';

type Props = {
  endsAt: Date;
  onEndsAtChange: (value: Date) => void;
  onStartsAtChange: (value: Date) => void;
  startsAt: Date;
};

export function GatheringScheduleFields({ endsAt, onEndsAtChange, onStartsAtChange, startsAt }: Props) {
  const picker = useSchedulePicker({ endsAt, onEndsAtChange, onStartsAtChange, startsAt });
  return (
    <View style={styles.wrapper}>
      <View accessible={false} style={styles.timeline}>
        <View style={styles.timelineRail} />
        <View style={[styles.timelineDot, styles.startDot]} />
        <View style={[styles.timelineDot, styles.endDot]} />
      </View>
      <View style={styles.rows}>
        <ScheduleRow
          dateLabel={formatDate(startsAt)}
          icon="play-circle-outline"
          label="Starts"
          onDatePress={picker.openStartDate}
          onTimePress={picker.openStartTime}
          timeLabel={formatTime(startsAt)}
        />
        <ScheduleRow
          dateLabel={formatDate(endsAt)}
          icon="checkmark-circle-outline"
          label="Ends"
          onDatePress={picker.openEndDate}
          onTimePress={picker.openEndTime}
          timeLabel={formatTime(endsAt)}
        />
      </View>
      {picker.target && (
        <View style={styles.pickerPanel}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{picker.title}</Text>
            {Platform.OS === 'ios' && (
              <Pressable accessibilityRole="button" onPress={picker.close}>
                <Text style={styles.done}>Done</Text>
              </Pressable>
            )}
          </View>
          <DateTimePicker
            accessibilityLabel={`Choose gathering ${picker.title.toLowerCase()}`}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={picker.minimumDate}
            mode={picker.mode}
            onChange={picker.change}
            value={picker.value}
          />
        </View>
      )}
    </View>
  );
}

function ScheduleRow({
  dateLabel,
  icon,
  label,
  onDatePress,
  onTimePress,
  timeLabel,
}: {
  dateLabel: string;
  icon: 'play-circle-outline' | 'checkmark-circle-outline';
  label: string;
  onDatePress: () => void;
  onTimePress: () => void;
  timeLabel: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.labelWrap}>
        <Ionicons color={colors.primary} name={icon} size={18} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.valueGroup}>
        <Pressable accessibilityLabel={`Choose ${label.toLowerCase()} date`} accessibilityRole="button" onPress={onDatePress} style={styles.valueButton}>
          <Text style={styles.valueText}>{dateLabel}</Text>
        </Pressable>
        <Pressable accessibilityLabel={`Choose ${label.toLowerCase()} time`} accessibilityRole="button" onPress={onTimePress} style={styles.valueButton}>
          <Text style={styles.valueText}>{timeLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function useSchedulePicker({ endsAt, onEndsAtChange, onStartsAtChange, startsAt }: Props) {
  const [target, setTarget] = useState<PickerTarget | null>(null);
  const openStartDate = useCallback(() => setTarget('start_date'), []);
  const openStartTime = useCallback(() => setTarget('start_time'), []);
  const openEndDate = useCallback(() => setTarget('end_date'), []);
  const openEndTime = useCallback(() => setTarget('end_time'), []);
  const close = useCallback(() => setTarget(null), []);
  const change = useCallback((event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios' || event.type === 'dismissed') setTarget(null);
    if (!target || !selected || event.type === 'dismissed') return;

    const current = target.startsWith('start') ? startsAt : endsAt;
    const mode = target.endsWith('date') ? 'date' : 'time';
    const next = mergeDateTime(current, selected, mode);
    if (target.startsWith('start')) {
      onStartsAtChange(next);
    } else {
      onEndsAtChange(next);
    }
  }, [endsAt, onEndsAtChange, onStartsAtChange, startsAt, target]);

  const isStart = target?.startsWith('start') ?? false;
  const mode = target?.endsWith('date') ? 'date' : 'time';
  return {
    change,
    close,
    minimumDate: mode === 'date' ? (isStart ? new Date() : startsAt) : undefined,
    mode,
    openEndDate,
    openEndTime,
    openStartDate,
    openStartTime,
    target,
    title: `${isStart ? 'Start' : 'End'} ${mode}`,
    value: isStart ? startsAt : endsAt,
  } as const;
}

function mergeDateTime(current: Date, selected: Date, mode: 'date' | 'time') {
  const next = new Date(current);
  if (mode === 'date') {
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
  } else {
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  }
  return next;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', weekday: 'short' }).format(value);
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value);
}

const styles = StyleSheet.create({
  wrapper: { gap: 12 },
  timeline: { bottom: 20, left: 7, position: 'absolute', top: 20, width: 12 },
  timelineRail: { backgroundColor: colors.border, bottom: 8, left: 5, position: 'absolute', top: 8, width: 2 },
  timelineDot: { backgroundColor: colors.card, borderColor: colors.primary, borderRadius: 6, borderWidth: 2, height: 12, left: 0, position: 'absolute', width: 12 },
  startDot: { top: 7 },
  endDot: { bottom: 7 },
  rows: { gap: 12, paddingLeft: 22 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  labelWrap: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  rowLabel: { color: colors.ink, fontFamily: fonts.black, fontSize: 13, fontWeight: '900' },
  valueGroup: { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  valueButton: { backgroundColor: colors.primarySoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  valueText: { color: colors.primaryDark, fontFamily: fonts.bold, fontSize: 12, fontWeight: '700' },
  pickerPanel: { backgroundColor: colors.primarySoft, borderRadius: 16, padding: 10 },
  pickerHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 7 },
  pickerTitle: { color: colors.ink, fontFamily: fonts.black, fontSize: 14, fontWeight: '900', textTransform: 'capitalize' },
  done: { color: colors.primaryDark, fontFamily: fonts.black, fontSize: 14, fontWeight: '900', padding: 7 },
});
