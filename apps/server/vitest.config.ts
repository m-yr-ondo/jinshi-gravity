import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Colyseus' listen() calls `process.send('ready')` when an IPC channel is
    // present. In vitest's default forks pool that channel is the parent
    // vitest runner, and an extraneous message corrupts the IPC protocol.
    // The threads pool runs inside a worker thread with no such channel.
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
  },
});