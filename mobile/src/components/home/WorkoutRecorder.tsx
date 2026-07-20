import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { formatElapsedTime, type WorkoutRecorderPhase } from '../../features/workouts/useWorkoutRecorder';
import { Button, Card, TextField, colors, fonts } from '../ui';

type Props = {
  elapsedMilliseconds: number;
  onDiscard: () => void;
  onEnd: () => void;
  onPause: () => void;
  onResume: () => void;
  onStart: () => void;
  onTitleChange: (title: string) => void;
  phase: WorkoutRecorderPhase;
  title: string;
};

export function WorkoutRecorder({
  elapsedMilliseconds,
  onDiscard,
  onEnd,
  onPause,
  onResume,
  onStart,
  onTitleChange,
  phase,
  title,
}: Props) {
  const isRecording = phase === 'recording';
  const isPaused = phase === 'paused';
  const isReviewing = phase === 'review';
  const animation = useWorkoutAnimation(phase, isRecording);

  return (
    <Animated.View style={animation.containerStyle}>
      <Card style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.iconCircle}>
          <Ionicons color={colors.primary} name="stopwatch-outline" size={25} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{isRecording ? 'RECORDING NOW' : isPaused ? 'WORKOUT PAUSED' : isReviewing ? 'WORKOUT ENDED' : 'READY TO PLAY'}</Text>
          <Text style={styles.title}>{isReviewing ? 'Review your activity' : isPaused ? 'Take a breather' : 'Track your court time'}</Text>
        </View>
        {isRecording && (
          <Animated.View accessibilityLabel="Recording" style={[styles.liveDot, animation.liveDotStyle]} />
        )}
      </View>

      <TextField
        editable={!isRecording}
        onChangeText={onTitleChange}
        placeholder="Workout title"
        value={title}
      />

      <View style={styles.timerPanel}>
        <Text style={styles.timer}>{formatElapsedTime(elapsedMilliseconds)}</Text>
        <Text style={styles.timerLabel}>{isReviewing ? 'RECORDED TIME' : 'ELAPSED TIME'}</Text>
      </View>

      {phase === 'idle' && (
        <>
          <Text style={styles.help}>Start the timer when your workout begins. You can create a post after you end it.</Text>
          <Button icon="play" onPress={onStart}>Start recording</Button>
        </>
      )}

      {isRecording && (
        <>
          <Text style={styles.help}>The timer uses the start time, so it stays accurate if the app briefly goes into the background.</Text>
          <View style={styles.recordingActions}>
            <Button icon="pause" onPress={onPause} variant="secondary">Pause</Button>
            <Button icon="stop" onPress={onEnd}>End workout</Button>
          </View>
          <Button onPress={onDiscard} variant="danger">Discard recording</Button>
        </>
      )}

      {isPaused && (
        <>
          <Text style={styles.help}>Paused time is not added to your recorded workout.</Text>
          <View style={styles.recordingActions}>
            <Button icon="play" onPress={onResume} variant="secondary">Resume</Button>
            <Button icon="stop" onPress={onEnd}>End workout</Button>
          </View>
          <Button onPress={onDiscard} variant="danger">Discard recording</Button>
        </>
      )}

      {isReviewing && (
        <>
          <Text style={styles.help}>Your workout is finalized. Complete the activity details below to save and share it.</Text>
          <Button onPress={onDiscard} variant="danger">Discard activity</Button>
        </>
      )}
      </Card>
    </Animated.View>
  );
}

function useWorkoutAnimation(phase: WorkoutRecorderPhase, isRecording: boolean) {
  const entrance = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [entrance, phase]);

  useEffect(() => {
    if (!isRecording) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 650, easing: Easing.inOut(Easing.ease), toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 650, easing: Easing.inOut(Easing.ease), toValue: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  return useMemo(
    () => ({
      containerStyle: {
        opacity: entrance,
        transform: [
          { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
        ],
      },
      liveDotStyle: {
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] }) }],
      },
    }),
    [entrance, pulse],
  );
}

const styles = StyleSheet.create({
  card: { gap: 16 },
  headingRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  iconCircle: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  headingCopy: { flex: 1 },
  eyebrow: { color: colors.primary, fontFamily: fonts.black, fontSize: 10, fontWeight: '900' },
  title: { color: colors.ink, fontFamily: fonts.black, fontSize: 19, fontWeight: '900' },
  liveDot: { backgroundColor: '#EF4444', borderRadius: 6, height: 12, width: 12 },
  timerPanel: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 12, borderWidth: 1, paddingVertical: 24 },
  timer: { color: colors.ink, fontFamily: fonts.black, fontSize: 39, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: 0.5 },
  timerLabel: { color: colors.muted, fontFamily: fonts.black, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  recordingActions: { flexDirection: 'row', gap: 10 },
});
