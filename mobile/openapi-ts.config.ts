export default {
  input: process.env.EXPO_PUBLIC_API_BASE_URL
    ? `${process.env.EXPO_PUBLIC_API_BASE_URL.replace(/\/+$/, '')}/openapi.json`
    : 'http://localhost:3000/openapi.json',
  output: 'src/api/generated',
  plugins: ['@hey-api/client-fetch', '@hey-api/sdk', '@hey-api/typescript'],
};
