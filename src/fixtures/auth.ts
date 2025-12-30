import { test as base } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export type AuthOptions = {
  storageStatePath?: string;
};

/**
 * Auth fixture for managing authentication state
 * Supports loading and saving storageState for session persistence
 */
export const authFixture = base.extend<{ auth: AuthOptions }>({
  auth: async ({ context }, use) => {
    const storageStatePath = process.env.STORAGE_STATE_PATH || 
                            path.join(process.cwd(), '.auth', `state-${process.pid}.json`);
    
    // Ensure .auth directory exists
    const authDir = path.dirname(storageStatePath);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const authOptions: AuthOptions = {
      storageStatePath,
    };

    await use(authOptions);

    // Optional: Save state after test if context was modified
    try {
      await context.storageState({ path: storageStatePath });
    } catch (error) {
      // Context might be closed, ignore
    }
  },
});

/**
 * Helper to load authentication state
 */
export async function loadAuthState(statePath: string): Promise<any> {
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  }
  return null;
}

/**
 * Helper to save authentication state
 */
export async function saveAuthState(context: any, statePath: string): Promise<void> {
  const authDir = path.dirname(statePath);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  await context.storageState({ path: statePath });
}
