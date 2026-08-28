import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/local-foundation/**/*.test.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/local-foundation/**/*.{ts,tsx}'],
      exclude: [
        'src/local-foundation/**/*.test.{ts,tsx}',
        'src/local-foundation/**/*.stories.{ts,tsx}',
        'src/local-foundation/**/*.d.ts',
      ],
    },
  },
});
