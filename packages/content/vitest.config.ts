import { defineConfig } from 'vitest/config';

/**
 * Globals are on so the existing src/index.test.ts, which uses bare
 * describe/it/expect, keeps working without being rewritten. The newer tests
 * import them explicitly, which is the more robust style, but the config has to
 * satisfy both.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
