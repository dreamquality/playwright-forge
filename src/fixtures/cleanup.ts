import { test as base } from '@playwright/test';

export type CleanupTask = () => Promise<void> | void;

export type CleanupOptions = {
  addTask: (task: CleanupTask) => void;
};

/**
 * Cleanup fixture for managing teardown tasks
 * Ensures proper cleanup even if tests fail
 * Parallel-safe with per-test isolation
 */
export const cleanupFixture = base.extend<{ cleanup: CleanupOptions }>({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-empty-pattern
  cleanup: async ({}, use) => {
    const tasks: CleanupTask[] = [];

    const cleanup: CleanupOptions = {
      addTask: (task: CleanupTask) => {
        tasks.push(task);
      },
    };

    await use(cleanup);

    // Execute cleanup tasks in reverse order (LIFO)
    for (const task of tasks.reverse()) {
      try {
        await task();
      } catch (error) {
        console.error('Cleanup task failed:', error);
      }
    }
  },
});
