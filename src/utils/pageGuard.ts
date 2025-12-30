import { Page, Locator } from '@playwright/test';

/**
 * Mode for page guard behavior
 */
export type PageGuardMode = 'strict' | 'tolerant';

/**
 * Element condition for component readiness checks
 */
export interface ElementCondition {
  selector: string;
  state?: 'visible' | 'hidden' | 'attached' | 'detached';
  attribute?: string;
  attributeValue?: string | RegExp;
}

/**
 * Comprehensive page guard configuration
 */
export interface PageGuardConfig {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Polling interval in milliseconds (default: 100) */
  interval?: number;
  /** Strict mode throws errors, tolerant mode logs warnings (default: 'strict') */
  mode?: PageGuardMode;
  /** List of mandatory selectors that must be present */
  mandatorySelectors?: string[];
  /** List of selectors to ignore during checks */
  ignoredSelectors?: string[];
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Wait for network idle (default: false) */
  waitForNetworkIdle?: boolean;
  /** Retry count for failed actions (default: 3) */
  retryCount?: number;
  /** Retry interval in milliseconds (default: 1000) */
  retryInterval?: number;
}

/**
 * Page guard options for verification
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
  private config: Required<PageGuardConfig>;
  private warnings: string[] = [];

  constructor(private page: Page, config: PageGuardConfig = {}) {
    // Set defaults
    this.config = {
      timeout: config.timeout ?? 30000,
      interval: config.interval ?? 100,
      mode: config.mode ?? 'strict',
      mandatorySelectors: config.mandatorySelectors ?? [],
      ignoredSelectors: config.ignoredSelectors ?? [],
      debug: config.debug ?? false,
      waitForNetworkIdle: config.waitForNetworkIdle ?? false,
      retryCount: config.retryCount ?? 3,
      retryInterval: config.retryInterval ?? 1000,
    };
  }

  /**
   * Log debug message if debug mode is enabled
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[PageGuard] ${message}`);
    }
  }

  /**
   * Handle error based on mode (strict throws, tolerant logs warning)
   */
  private handleError(error: string): void {
    if (this.config.mode === 'strict') {
      throw new Error(error);
    } else {
      this.warnings.push(error);
      this.log(`Warning: ${error}`);
    }
  }

  /**
   * Get accumulated warnings (useful in tolerant mode)
   */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  /**
   * Clear accumulated warnings
   */
  clearWarnings(): void {
    this.warnings = [];
  }

  /**
   * Wait for the page to be ready with comprehensive checks
   * @param timeout - Optional timeout override
   */
  async waitForReady(timeout?: number): Promise<void> {
    const effectiveTimeout = timeout ?? this.config.timeout;
    this.log(`Waiting for page ready (timeout: ${effectiveTimeout}ms)`);

    try {
      // Wait for document.readyState === 'complete'
      this.log('Checking document.readyState...');
      await this.page.waitForFunction(
        '() => document.readyState === "complete"',
        { timeout: effectiveTimeout }
      );

      // Wait for load state
      this.log('Waiting for load state...');
      await this.page.waitForLoadState('load', { timeout: effectiveTimeout });

      // Optionally wait for network idle
      if (this.config.waitForNetworkIdle) {
        this.log('Waiting for network idle...');
        await this.page.waitForLoadState('networkidle', { timeout: effectiveTimeout });
      }

      // Check mandatory selectors
      await this.checkMandatorySelectors(effectiveTimeout);

      this.log('Page is ready');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.handleError(`Page readiness check failed: ${errorMessage}`);
    }
  }

  /**
   * Check that all mandatory selectors are visible and enabled
   */
  private async checkMandatorySelectors(timeout: number): Promise<void> {
    if (this.config.mandatorySelectors.length === 0) {
      return;
    }

    this.log(`Checking ${this.config.mandatorySelectors.length} mandatory selectors...`);

    for (const selector of this.config.mandatorySelectors) {
      if (this.config.ignoredSelectors.includes(selector)) {
        this.log(`Skipping ignored selector: ${selector}`);
        continue;
      }

      try {
        const locator = this.page.locator(selector);
        await locator.waitFor({ state: 'visible', timeout });
        this.log(`Mandatory selector ready: ${selector}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.handleError(`Mandatory selector "${selector}" not ready: ${errorMessage}`);
      }
    }
  }

  /**
   * Wait for URL to match pattern
   * @param pattern - URL pattern to match
   * @param timeout - Optional timeout
   */
  async waitForUrl(pattern: string | RegExp, timeout?: number): Promise<void> {
    const effectiveTimeout = timeout ?? this.config.timeout;
    this.log(`Waiting for URL to match pattern: ${pattern}`);
    
    try {
      await this.page.waitForURL(pattern, { timeout: effectiveTimeout });
      this.log('URL pattern matched');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.handleError(`URL pattern match failed: ${errorMessage}`);
    }
  }

  /**
   * Wait for component readiness with optional conditions
   * @param conditions - Array of element conditions to check
   * @param timeout - Optional timeout override
   */
  async waitForComponent(
    conditions: ElementCondition[],
    timeout?: number
  ): Promise<void> {
    const effectiveTimeout = timeout ?? this.config.timeout;
    this.log(`Waiting for component with ${conditions.length} conditions`);

    for (const condition of conditions) {
      try {
        await this.checkElementCondition(condition, effectiveTimeout);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.handleError(`Component condition failed for "${condition.selector}": ${errorMessage}`);
      }
    }

    this.log('Component is ready');
  }

  /**
   * Check a single element condition
   */
  private async checkElementCondition(
    condition: ElementCondition,
    timeout: number
  ): Promise<void> {
    const { selector, state = 'visible', attribute, attributeValue } = condition;

    this.log(`Checking condition for selector: ${selector}, state: ${state}`);

    const locator = this.page.locator(selector);

    // Wait for the specified state
    await locator.waitFor({ state, timeout });

    // Check attribute if specified
    if (attribute && attributeValue !== undefined) {
      this.log(`Checking attribute: ${attribute}`);

      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const actualValue = await locator.getAttribute(attribute);

        if (actualValue !== null) {
          const matches =
            typeof attributeValue === 'string'
              ? actualValue === attributeValue
              : attributeValue.test(actualValue);

          if (matches) {
            this.log(`Attribute condition met: ${attribute}=${actualValue}`);
            return;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, this.config.interval));
      }

      throw new Error(
        `Attribute condition not met: ${attribute} should match ${attributeValue}`
      );
    }
  }

  /**
   * Guard that ensures element is visible and enabled before interacting
   * @param selector - Element selector
   * @param timeout - Optional timeout
   * @returns The locator
   */
  async guardElement(selector: string, timeout?: number): Promise<Locator> {
    const effectiveTimeout = timeout ?? this.config.timeout;
    this.log(`Guarding element: ${selector}`);

    try {
      const locator = this.page.locator(selector);
      await locator.waitFor({ state: 'visible', timeout: effectiveTimeout });
      this.log(`Element ready: ${selector}`);
      return locator;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.handleError(`Element guard failed for "${selector}": ${errorMessage}`);
      // Return locator even in tolerant mode
      return this.page.locator(selector);
    }
  }

  /**
   * Retry an action with automatic retries
   * @param action - Function to execute
   * @param actionName - Name of the action for logging
   * @returns The result of the action
   */
  async retryAction<T>(
    action: () => Promise<T>,
    actionName: string = 'action'
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.retryCount; attempt++) {
      try {
        this.log(`Attempt ${attempt}/${this.config.retryCount} for ${actionName}`);
        const result = await action();
        this.log(`${actionName} succeeded on attempt ${attempt}`);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.log(`${actionName} failed on attempt ${attempt}: ${lastError.message}`);

        if (attempt < this.config.retryCount) {
          this.log(`Waiting ${this.config.retryInterval}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, this.config.retryInterval));
        }
      }
    }

    const errorMessage = `${actionName} failed after ${this.config.retryCount} attempts: ${lastError?.message}`;
    this.handleError(errorMessage);
    throw lastError || new Error(errorMessage);
  }

  /**
   * Click element with retry logic
   * @param selector - Element selector
   * @param timeout - Optional timeout
   */
  async click(selector: string, timeout?: number): Promise<void> {
    await this.retryAction(async () => {
      const locator = await this.guardElement(selector, timeout);
      await locator.click();
    }, `click(${selector})`);
  }

  /**
   * Fill element with retry logic
   * @param selector - Element selector
   * @param value - Value to fill
   * @param timeout - Optional timeout
   */
  async fill(selector: string, value: string, timeout?: number): Promise<void> {
    await this.retryAction(async () => {
      const locator = await this.guardElement(selector, timeout);
      await locator.fill(value);
    }, `fill(${selector})`);
  }

  /**
   * Select option with retry logic
   * @param selector - Element selector
   * @param value - Value to select
   * @param timeout - Optional timeout
   */
  async selectOption(
    selector: string,
    value: string | string[],
    timeout?: number
  ): Promise<void> {
    await this.retryAction(async () => {
      const locator = await this.guardElement(selector, timeout);
      await locator.selectOption(value);
    }, `selectOption(${selector})`);
  }

  /**
   * Verify page is at expected state
   * @param options - Guard options
   */
  async verify(options: PageGuardOptions = {}): Promise<void> {
    const effectiveTimeout = options.timeout ?? this.config.timeout;
    this.log('Verifying page state...');

    if (options.urlPattern) {
      await this.waitForUrl(options.urlPattern, effectiveTimeout);
    }

    if (options.titlePattern) {
      try {
        const title = await this.page.title();
        const pattern =
          typeof options.titlePattern === 'string'
            ? new RegExp(options.titlePattern)
            : options.titlePattern;

        if (!pattern.test(title)) {
          throw new Error(
            `Page title "${title}" does not match pattern ${options.titlePattern}`
          );
        }
        this.log('Page title matches pattern');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.handleError(`Page verification failed: ${errorMessage}`);
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
    const effectiveTimeout = timeout ?? this.config.timeout;
    this.log(`Waiting for element to be stable: ${selector}`);

    try {
      const locator = this.page.locator(selector);
      await locator.waitFor({ state: 'visible', timeout: effectiveTimeout });

      const startTime = Date.now();
      const checkInterval = this.config.interval;
      let stableCount = 0;
      let previousBox = await locator.boundingBox();

      while (stableCount < stabilityThreshold) {
        if (Date.now() - startTime > effectiveTimeout) {
          throw new Error(`Element ${selector} did not stabilize within timeout`);
        }

        await new Promise((resolve) => setTimeout(resolve, checkInterval));

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

      this.log(`Element is stable: ${selector}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.handleError(`Element stability check failed for "${selector}": ${errorMessage}`);
    }
  }
}

/**
 * Create a page guard with optional configuration
 * @param page - Playwright page
 * @param config - Optional configuration
 */
export function createPageGuard(page: Page, config?: PageGuardConfig): PageGuard {
  return new PageGuard(page, config);
}
