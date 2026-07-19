# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## React Native component rules

- Do not declare event handlers or action functions inside React component bodies.
- Do not use inline arrow functions for JSX event-handler props.
- Keep pure behavior at module scope. Put behavior that depends on component state in a custom hook and return stable callbacks created with `useCallback`.
- Prefer passing stable function references to child components so memoized children can avoid unnecessary renders.
