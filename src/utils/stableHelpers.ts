import { Page, Locator } from '@playwright/test';

/**
 * Scroll behavior for stable actions
 */
export type ScrollBehavior = 'auto' | 'center' | 'nearest';

/**
 * Mode for stable action behavior
 */
export type StableActionMode = 'strict' | 'tolerant';

/**
 * Configuration for stable actions
 */
export interface StableActionConfig {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Retry interval in milliseconds (default: 100) */
  retryInterval?: number;
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** 
   * Scroll behavior when element is not in viewport (default: 'auto')
   * Note: Currently reserved for future use. Playwright's scrollIntoViewIfNeeded
   * automatically handles scrolling without explicit behavior configuration.
   */
  scrollBehavior?: ScrollBehavior;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Strict mode throws errors immediately, tolerant mode logs warnings and returns without throwing (default: 'strict') */
  mode?: StableActionMode;
  /** Number of consecutive stable checks required (default: 3) */
  stabilityThreshold?: number;
  /** Interval between stability checks in milliseconds (default: 100) */
  stabilityCheckInterval?: number;
}

/**
 * Internal configuration with all defaults resolved
 */
interface ResolvedConfig extends Required<StableActionConfig> {}

/**
 * Resolve configuration with defaults and validate values
 */
function resolveConfig(config?: StableActionConfig): ResolvedConfig {
  const timeout = config?.timeout ?? 30000;
  const retryInterval = config?.retryInterval ?? 100;
  const maxRetries = config?.maxRetries ?? 3;
  const stabilityThreshold = config?.stabilityThreshold ?? 3;
  const stabilityCheckInterval = config?.stabilityCheckInterval ?? 100;

  // Validate configuration values
  if (timeout <= 0) {
    throw new Error('timeout must be greater than 0');
  }
  if (retryInterval < 0) {
    throw new Error('retryInterval must be non-negative');
  }
  if (maxRetries < 1) {
    throw new Error('maxRetries must be at least 1');
  }
  if (stabilityThreshold < 1) {
    throw new Error('stabilityThreshold must be at least 1');
  }
  if (stabilityCheckInterval < 0) {
    throw new Error('stabilityCheckInterval must be non-negative');
  }

  return {
    timeout,
    retryInterval,
    maxRetries,
    scrollBehavior: config?.scrollBehavior ?? 'auto',
    debug: config?.debug ?? false,
    mode: config?.mode ?? 'strict',
    stabilityThreshold,
    stabilityCheckInterval,
  };
}

/**
 * Log debug message if debug mode is enabled
 */
function log(message: string, config: ResolvedConfig): void {
  if (config.debug) {
    console.log(`[StableHelpers] ${message}`);
  }
}

/**
 * Handle error based on mode
 * In strict mode: throws immediately
 * In tolerant mode: logs warning and returns without throwing
 */
function handleError(error: string, config: ResolvedConfig): void {
  if (config.mode === 'strict') {
    throw new Error(error);
  } else {
    log(`Warning: ${error}`, config);
  }
}

/**
 * Wait for element to be visible
 */
async function waitForVisible(
  locator: Locator,
  config: ResolvedConfig
): Promise<void> {
  try {
    await locator.waitFor({ state: 'visible', timeout: config.timeout });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    handleError(`Element not visible: ${message}`, config);
    throw error;
  }
}

/**
 * Wait for element to be enabled
 */
async function waitForEnabled(
  locator: Locator,
  config: ResolvedConfig
): Promise<void> {
  const startTime = Date.now();
  
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= config.timeout) {
      break;
    }

    const remaining = config.timeout - elapsed;
    const checkTimeout = Math.min(config.retryInterval, remaining);

    const isDisabled = await locator.isDisabled({ timeout: checkTimeout }).catch(() => true);
    if (!isDisabled) {
      return;
    }

    const elapsedAfterCheck = Date.now() - startTime;
    if (elapsedAfterCheck >= config.timeout) {
      break;
    }

    const sleepTime = Math.min(config.retryInterval, config.timeout - elapsedAfterCheck);
    if (sleepTime > 0) {
      await new Promise(resolve => setTimeout(resolve, sleepTime));
    }
  }
  
  const error = `Element is disabled: ${locator.toString()}`;
  handleError(error, config);
  throw new Error(error);
}

/**
 * Wait for element to be stable (not animating)
 */
async function waitForStable(
  locator: Locator,
  config: ResolvedConfig
): Promise<void> {
  const startTime = Date.now();
  let stableCount = 0;
  let nullCount = 0;
  let previousBox = await locator.boundingBox().catch(() => null);

  while (stableCount < config.stabilityThreshold) {
    if (Date.now() - startTime > config.timeout) {
      const error = `Element did not stabilize within timeout: ${locator.toString()}`;
      handleError(error, config);
      throw new Error(error);
    }

    await new Promise(resolve => setTimeout(resolve, config.stabilityCheckInterval));

    const currentBox = await locator.boundingBox().catch(() => null);

    // Both boxes must exist to be considered stable
    if (previousBox && currentBox &&
      previousBox.x === currentBox.x &&
      previousBox.y === currentBox.y &&
      previousBox.width === currentBox.width &&
      previousBox.height === currentBox.height
    ) {
      stableCount++;
      nullCount = 0;
    } else if (!currentBox || !previousBox) {
      // If element is not found/rendered, track consecutive null checks
      nullCount++;
      stableCount = 0;
      
      // Fail faster if element is consistently null
      if (nullCount >= 5) {
        const error = `Element not found or not rendered after ${nullCount} checks: ${locator.toString()}`;
        handleError(error, config);
        throw new Error(error);
      }
    } else {
      stableCount = 0;
      nullCount = 0;
    }

    previousBox = currentBox;
  }
}

/**
 * Scroll element into view if needed
 */
async function scrollIntoView(
  locator: Locator,
  config: ResolvedConfig
): Promise<void> {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: config.timeout });
  } catch (error) {
    log(`Scroll into view failed: ${error}`, config);
    // Non-critical, continue
  }
}

/**
 * Stable Click - Wait for element to be visible, enabled, and stable before clicking
 * 
 * Features:
 * - Waits for element to be visible, enabled, and stable
 * - Automatically scrolls element into view
 * - Retries if element detaches or is covered
 * - Configurable timeout, retries, and scroll behavior
 * 
 * @param page - Playwright page
 * @param selector - Element selector
 * @param config - Optional configuration
 */
export async function stableClick(
  page: Page,
  selector: string,
  config?: StableActionConfig
): Promise<void> {
  const resolvedConfig = resolveConfig(config);
  log(`stableClick: ${selector}`, resolvedConfig);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= resolvedConfig.maxRetries; attempt++) {
    try {
      log(`Attempt ${attempt}/${resolvedConfig.maxRetries}`, resolvedConfig);

      const locator = page.locator(selector);

      // Wait for visible
      await waitForVisible(locator, resolvedConfig);
      log('Element is visible', resolvedConfig);

      // Wait for enabled
      await waitForEnabled(locator, resolvedConfig);
      log('Element is enabled', resolvedConfig);

      // Scroll into view
      await scrollIntoView(locator, resolvedConfig);
      log('Element scrolled into view', resolvedConfig);

      // Wait for stable
      await waitForStable(locator, resolvedConfig);
      log('Element is stable', resolvedConfig);

      // Click - Playwright will automatically fail if element is covered
      await locator.click({ timeout: resolvedConfig.timeout });
      log('Click succeeded', resolvedConfig);
      return;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log(`Attempt ${attempt} failed: ${lastError.message}`, resolvedConfig);

      if (attempt < resolvedConfig.maxRetries) {
        log(`Waiting ${resolvedConfig.retryInterval}ms before retry...`, resolvedConfig);
        await new Promise(resolve => setTimeout(resolve, resolvedConfig.retryInterval));
      }
    }
  }

  const errorMessage = `stableClick failed for "${selector}" after ${resolvedConfig.maxRetries} attempts: ${lastError?.message}`;
  handleError(errorMessage, resolvedConfig);
  
  // In strict mode, handleError already threw. In tolerant mode, return without throwing.
  if (resolvedConfig.mode === 'tolerant') {
    return;
  }
  
  throw lastError || new Error(errorMessage);
}

/**
 * Stable Fill - Wait for input/textarea to be ready and fill with retry
 * 
 * Features:
 * - Waits for element to be visible and enabled
 * - Clears existing value safely
 * - Retries until value is properly set
 * - Verifies the value was set correctly
 * 
 * @param page - Playwright page
 * @param selector - Input/textarea selector
 * @param value - Value to fill
 * @param config - Optional configuration
 */
export async function stableFill(
  page: Page,
  selector: string,
  value: string,
  config?: StableActionConfig
): Promise<void> {
  const resolvedConfig = resolveConfig(config);
  log(`stableFill: ${selector} with value: "${value}"`, resolvedConfig);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= resolvedConfig.maxRetries; attempt++) {
    try {
      log(`Attempt ${attempt}/${resolvedConfig.maxRetries}`, resolvedConfig);

      const locator = page.locator(selector);

      // Wait for visible
      await waitForVisible(locator, resolvedConfig);
      log('Element is visible', resolvedConfig);

      // Wait for enabled
      await waitForEnabled(locator, resolvedConfig);
      log('Element is enabled', resolvedConfig);

      // Scroll into view
      await scrollIntoView(locator, resolvedConfig);
      log('Element scrolled into view', resolvedConfig);

      // Clear and fill
      await locator.clear({ timeout: resolvedConfig.timeout });
      log('Element cleared', resolvedConfig);

      await locator.fill(value, { timeout: resolvedConfig.timeout });
      log('Element filled', resolvedConfig);

      // Verify value was set
      const inputValue = await locator.inputValue();
      if (inputValue !== value) {
        throw new Error(`Value verification failed: expected "${value}", got "${inputValue}"`);
      }
      log('Value verified', resolvedConfig);

      return;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log(`Attempt ${attempt} failed: ${lastError.message}`, resolvedConfig);

      if (attempt < resolvedConfig.maxRetries) {
        log(`Waiting ${resolvedConfig.retryInterval}ms before retry...`, resolvedConfig);
        await new Promise(resolve => setTimeout(resolve, resolvedConfig.retryInterval));
      }
    }
  }

  const errorMessage = `stableFill failed for "${selector}" after ${resolvedConfig.maxRetries} attempts: ${lastError?.message}`;
  handleError(errorMessage, resolvedConfig);
  
  // In strict mode, handleError already threw. In tolerant mode, return without throwing.
  if (resolvedConfig.mode === 'tolerant') {
    return;
  }
  
  throw lastError || new Error(errorMessage);
}

/**
 * Stable Select - Wait for select element and options to be loaded, then select with retry
 * 
 * Features:
 * - Waits for select element to be visible and enabled
 * - Waits for options to be loaded
 * - Retries selection if DOM updates
 * - Verifies the selection was successful (all values for multi-select)
 * 
 * @param page - Playwright page
 * @param selector - Select element selector
 * @param value - Value(s) to select (string or array for multi-select)
 * @param config - Optional configuration
 */
export async function stableSelect(
  page: Page,
  selector: string,
  value: string | string[],
  config?: StableActionConfig
): Promise<void> {
  const resolvedConfig = resolveConfig(config);
  const valueStr = Array.isArray(value) ? value.join(', ') : value;
  log(`stableSelect: ${selector} with value: ${valueStr}`, resolvedConfig);

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= resolvedConfig.maxRetries; attempt++) {
    try {
      log(`Attempt ${attempt}/${resolvedConfig.maxRetries}`, resolvedConfig);

      const locator = page.locator(selector);

      // Wait for visible
      await waitForVisible(locator, resolvedConfig);
      log('Element is visible', resolvedConfig);

      // Wait for enabled
      await waitForEnabled(locator, resolvedConfig);
      log('Element is enabled', resolvedConfig);

      // Scroll into view
      await scrollIntoView(locator, resolvedConfig);
      log('Element scrolled into view', resolvedConfig);

      // Wait for options to be available
      const optionsCount = await locator.locator('option').count();
      if (optionsCount === 0) {
        throw new Error('No options available in select element');
      }
      log(`Found ${optionsCount} options`, resolvedConfig);

      // Select option(s)
      await locator.selectOption(value, { timeout: resolvedConfig.timeout });
      log('Option(s) selected', resolvedConfig);

      // Verify selection
      if (Array.isArray(value)) {
        // For multi-select, verify that all expected values are selected
        const selectedValues = await locator
          .locator('option:checked')
          .evaluateAll((options: any[]) => 
            options.map((option: any) => option.value)
          );

        const missingValues = value.filter(v => !selectedValues.includes(v));
        if (missingValues.length > 0) {
          throw new Error(
            `Selection verification failed: expected values "${value.join(
              ', '
            )}" to be selected, but these were missing: "${missingValues.join(', ')}" (actual selected: "${selectedValues.join(', ')}")`
          );
        }
      } else {
        // For single-select, inputValue() correctly returns the selected option value
        const selectedValue = await locator.inputValue();
        const expectedValue = value;

        if (selectedValue !== expectedValue) {
          throw new Error(
            `Selection verification failed: expected value "${expectedValue}", got "${selectedValue}"`
          );
        }
      }
      log('Selection verified', resolvedConfig);

      return;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log(`Attempt ${attempt} failed: ${lastError.message}`, resolvedConfig);

      if (attempt < resolvedConfig.maxRetries) {
        log(`Waiting ${resolvedConfig.retryInterval}ms before retry...`, resolvedConfig);
        await new Promise(resolve => setTimeout(resolve, resolvedConfig.retryInterval));
      }
    }
  }

  const errorMessage = `stableSelect failed for "${selector}" after ${resolvedConfig.maxRetries} attempts: ${lastError?.message}`;
  handleError(errorMessage, resolvedConfig);
  
  // In strict mode, handleError already threw. In tolerant mode, return without throwing.
  if (resolvedConfig.mode === 'tolerant') {
    return;
  }
  
  throw lastError || new Error(errorMessage);
}
