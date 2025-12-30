import { test as base, APIRequestContext } from '@playwright/test';

/**
 * API fixture providing a configured API request context
 * Automatically manages request context lifecycle
 */
export const apiFixture = base.extend<{ api: APIRequestContext }>({
  api: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      // No hardcoded base URL - users can configure via test.use()
      extraHTTPHeaders: {
        'Accept': 'application/json',
      },
    });
    await use(context);
    await context.dispose();
  },
});
