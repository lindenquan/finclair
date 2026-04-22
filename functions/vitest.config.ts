import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Run tests serially — emulator has one Firestore instance
    fileParallelism: false,
    pool: "forks",
    singleFork: true,
    sequence: {
      concurrent: false,
    },
    // Increase timeouts for emulator operations
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
