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
