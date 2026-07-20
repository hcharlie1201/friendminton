import { useCallback, useEffect, useMemo, useState } from 'react';

export type WorkoutRecorderPhase = 'idle' | 'recording' | 'paused' | 'review';

export type RecordedWorkout = {
  elapsedMilliseconds: number;
  startedAt: string;
  stoppedAt: string;
};

export function useWorkoutRecorder() {
  const [accumulatedMilliseconds, setAccumulatedMilliseconds] = useState(0);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [segmentStartedAt, setSegmentStartedAt] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (segmentStartedAt === null) return undefined;

    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, [segmentStartedAt]);

  const start = useCallback(() => {
    const timestamp = Date.now();
    setAccumulatedMilliseconds(0);
    setRecordingStartedAt(timestamp);
    setSegmentStartedAt(timestamp);
    setIsPaused(false);
    setStoppedAt(null);
    setNow(timestamp);
  }, []);

  const pause = useCallback(() => {
    if (segmentStartedAt === null) return;

    const timestamp = Date.now();
    const segmentMilliseconds = timestamp - segmentStartedAt;
    setAccumulatedMilliseconds((current) => Math.max(1, current + segmentMilliseconds));
    setSegmentStartedAt(null);
    setIsPaused(true);
    setNow(timestamp);
  }, [segmentStartedAt]);

  const end = useCallback(() => {
    const timestamp = Date.now();
    if (segmentStartedAt !== null) {
      const segmentMilliseconds = timestamp - segmentStartedAt;
      setAccumulatedMilliseconds((current) => Math.max(1, current + segmentMilliseconds));
    }
    setSegmentStartedAt(null);
    setIsPaused(false);
    setStoppedAt(timestamp);
    setNow(timestamp);
  }, [segmentStartedAt]);

  const resume = useCallback(() => {
    const timestamp = Date.now();
    setSegmentStartedAt(timestamp);
    setIsPaused(false);
    setStoppedAt(null);
    setNow(timestamp);
  }, []);

  const reset = useCallback(() => {
    setAccumulatedMilliseconds(0);
    setRecordingStartedAt(null);
    setSegmentStartedAt(null);
    setIsPaused(false);
    setStoppedAt(null);
    setNow(Date.now());
  }, []);

  const liveSegmentMilliseconds = segmentStartedAt === null ? 0 : Math.max(0, now - segmentStartedAt);
  const elapsedMilliseconds = accumulatedMilliseconds + liveSegmentMilliseconds;
  const phase: WorkoutRecorderPhase = segmentStartedAt !== null
    ? 'recording'
    : stoppedAt !== null
      ? 'review'
      : isPaused
        ? 'paused'
        : 'idle';
  const recordedWorkout = useMemo<RecordedWorkout | null>(() => {
    if (phase !== 'review' || recordingStartedAt === null || stoppedAt === null) return null;

    return {
      elapsedMilliseconds,
      startedAt: new Date(recordingStartedAt).toISOString(),
      stoppedAt: new Date(stoppedAt).toISOString(),
    };
  }, [elapsedMilliseconds, phase, recordingStartedAt, stoppedAt]);

  return { elapsedMilliseconds, end, pause, phase, recordedWorkout, reset, resume, start };
}

export function formatElapsedTime(totalMilliseconds: number) {
  const wholeSeconds = Math.floor(totalMilliseconds / 1000);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const milliseconds = totalMilliseconds % 1000;
  const parts = [minutes, seconds].map((part) => String(part).padStart(2, '0'));
  const clock = hours > 0 ? `${String(hours).padStart(2, '0')}:${parts.join(':')}` : parts.join(':');

  return `${clock}.${String(milliseconds).padStart(3, '0')}`;
}
