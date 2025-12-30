import { Page, Locator } from '@playwright/test';

/**
 * Page guard options
 */
export type PageGuardOptions = {
  timeout?: number;
  urlPattern?: string | RegExp;
  titlePattern?: string | RegExp;
};

/**
 * Page guard for waiting and verifying page state
 */
export class PageGuard {
  constructor(private page: Page) {}

  /**
   * Wait for the page to be ready (loaded and no pending network requests)
   * @param timeout - Optional timeout
   */
  async waitForReady(timeout?: number): Promise<void> {
    await this.page.waitForLoadState('load', { timeout });
    await this.page.waitForLoadState('networkidle', { timeout });
  }

  /**
   * Wait for URL to match pattern
   * @param pattern - URL pattern to match
   * @param timeout - Optional timeout
   */
  async waitForUrl(pattern: string | RegExp, timeout?: number): Promise<void> {
    await this.page.waitForURL(pattern, { timeout });
  }

  /**
   * Guard that ensures element is visible and enabled before interacting
   * @param selector - Element selector
   * @param timeout - Optional timeout
   * @returns The locator
   */
  async guardElement(selector: string, timeout?: number): Promise<Locator> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
    return locator;
  }

  /**
   * Verify page is at expected state
   * @param options - Guard options
   */
  async verify(options: PageGuardOptions = {}): Promise<void> {
    if (options.urlPattern) {
      await this.waitForUrl(options.urlPattern, options.timeout);
    }
    
    if (options.titlePattern) {
      const title = await this.page.title();
      const pattern = typeof options.titlePattern === 'string' 
        ? new RegExp(options.titlePattern) 
        : options.titlePattern;
      
      if (!pattern.test(title)) {
        throw new Error(
          `Page title "${title}" does not match pattern ${options.titlePattern}`
        );
      }
    }
  }

  /**
   * Wait for element to be stable (not animating)
   * @param selector - Element selector
   * @param timeout - Optional timeout
   * @param stabilityThreshold - Number of consecutive checks with same position (default: 3)
   */
  async waitForStable(
    selector: string, 
    timeout?: number, 
    stabilityThreshold: number = 3
  ): Promise<void> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout });
    
    const startTime = Date.now();
    const maxTimeout = timeout || 5000;
    const checkInterval = 50;
    let stableCount = 0;
    let previousBox = await locator.boundingBox();
    
    while (stableCount < stabilityThreshold) {
      if (Date.now() - startTime > maxTimeout) {
        throw new Error(`Element ${selector} did not stabilize within timeout`);
      }
      
      // Use a promise-based delay instead of waitForTimeout
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      const currentBox = await locator.boundingBox();
      
      if (
        previousBox?.x === currentBox?.x && 
        previousBox?.y === currentBox?.y &&
        previousBox?.width === currentBox?.width &&
        previousBox?.height === currentBox?.height
      ) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      
      previousBox = currentBox;
    }
  }
}

/**
 * Create a page guard
 * @param page - Playwright page
 */
export function createPageGuard(page: Page): PageGuard {
  return new PageGuard(page);
}
