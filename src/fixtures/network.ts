import { test as base, Route } from '@playwright/test';

export type NetworkOptions = {
  waitForResponse: (urlPattern: string | RegExp, timeout?: number) => Promise<any>;
  interceptRequest: (urlPattern: string | RegExp, handler: (route: Route) => void) => Promise<void>;
  clearInterceptions: () => Promise<void>;
};

/**
 * Network fixture providing utilities for waiting and intercepting network requests
 * All operations are parallel-safe
 */
export const networkFixture = base.extend<{ network: NetworkOptions }>({
  network: async ({ page }, use) => {
    const interceptHandlers = new Map<string | RegExp, (route: Route) => void>();

    const network: NetworkOptions = {
      waitForResponse: async (urlPattern: string | RegExp, timeout?: number) => {
        return page.waitForResponse(urlPattern, { timeout });
      },

      interceptRequest: async (urlPattern: string | RegExp, handler: (route: Route) => void) => {
        interceptHandlers.set(urlPattern, handler);
        await page.route(urlPattern, handler);
      },

      clearInterceptions: async () => {
        for (const pattern of interceptHandlers.keys()) {
          await page.unroute(pattern);
        }
        interceptHandlers.clear();
      },
    };

    await use(network);

    // Cleanup: clear all interceptions
    await network.clearInterceptions();
  },
});
