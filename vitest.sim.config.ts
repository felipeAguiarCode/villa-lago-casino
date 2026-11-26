import { defineConfig } from 'vite';

/** Long-running balance simulations: `npm run sim:showdown`. Not part of `npm test`. */
export default defineConfig({
  test: { include: ['sim/**/*.sim.ts'], testTimeout: 3_600_000 },
} as any);
