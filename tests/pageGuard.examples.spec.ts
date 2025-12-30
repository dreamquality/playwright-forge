import { test } from '@playwright/test';
import { createPageGuard, type PageGuardConfig, type ElementCondition } from '../src';

/**
 * Example: Basic Page Guard Usage
 * 
 * This example demonstrates how to use the Page Guard utility
 * to ensure pages and components are fully ready before interactions.
 */

test.describe('Page Guard Examples', () => {
  
  test('Example 1: Basic page readiness with default config', async ({ page }) => {
    // Create a page guard with default configuration
    const guard = createPageGuard(page);
    
    // Navigate to your application
    await page.goto('https://example.com');
    
    // Wait for the page to be fully ready
    // - document.readyState === 'complete'
    // - page load state
    await guard.waitForReady();
    
    // Now safe to interact with the page
    await page.locator('#search').fill('search term');
  });

  test('Example 2: Page guard with custom configuration', async ({ page }) => {
    // Configure the page guard for your needs
    const config: PageGuardConfig = {
      timeout: 10000,              // 10 second timeout
      interval: 100,               // 100ms polling interval
      mode: 'strict',              // Throw errors on failures
      debug: true,                 // Enable debug logging
      waitForNetworkIdle: true,    // Wait for network to be idle
      retryCount: 3,               // Retry failed actions 3 times
      retryInterval: 1000,         // Wait 1 second between retries
      mandatorySelectors: [        // Elements that must be present
        '#header',
        '#main-content',
        '#footer'
      ]
    };
    
    const guard = createPageGuard(page, config);
    
    await page.goto('https://example.com');
    
    // This will check all mandatory selectors are visible
    await guard.waitForReady();
  });

  test('Example 3: Tolerant mode with warnings', async ({ page }) => {
    // Use tolerant mode to collect warnings instead of failing
    const guard = createPageGuard(page, {
      mode: 'tolerant',
      mandatorySelectors: ['#header', '#optional-banner'],
      timeout: 5000
    });
    
    await page.goto('https://example.com');
    await guard.waitForReady();
    
    // Check if there were any warnings
    const warnings = guard.getWarnings();
    if (warnings.length > 0) {
      console.log('Page readiness warnings:');
      warnings.forEach(w => console.log(`  - ${w}`));
    }
    
    // Clear warnings for next check
    guard.clearWarnings();
  });

  test('Example 4: Wait for specific component readiness', async ({ page }) => {
    const guard = createPageGuard(page);
    
    await page.goto('https://example.com/dashboard');
    
    // Define component readiness conditions
    const dashboardConditions: ElementCondition[] = [
      // Wait for dashboard container to be visible
      { selector: '#dashboard-container', state: 'visible' },
      
      // Wait for loading spinner to disappear
      { selector: '.loading-spinner', state: 'hidden' },
      
      // Wait for dashboard to have loaded state
      { 
        selector: '#dashboard-container', 
        state: 'visible',
        attribute: 'data-loaded', 
        attributeValue: 'true' 
      },
      
      // Wait for status indicator to show ready
      { 
        selector: '.status-indicator', 
        state: 'visible',
        attribute: 'data-status',
        attributeValue: /ready|complete/ // Can use regex
      }
    ];
    
    // Wait for all conditions to be met
    await guard.waitForComponent(dashboardConditions);
    
    // Now safe to interact with the dashboard
    console.log('Dashboard is fully loaded and ready');
  });

  test('Example 5: Guard elements before interaction', async ({ page }) => {
    const guard = createPageGuard(page);
    
    await page.goto('https://example.com/form');
    await guard.waitForReady();
    
    // Guard element before interacting - ensures it's visible and enabled
    const submitButton = await guard.guardElement('#submit-button');
    await submitButton.click();
  });

  test('Example 6: Actions with automatic retry', async ({ page }) => {
    const guard = createPageGuard(page, {
      retryCount: 3,
      retryInterval: 1000
    });
    
    await page.goto('https://example.com/dynamic-form');
    
    // These actions will automatically retry if they fail
    // (e.g., if element is temporarily not visible)
    await guard.fill('#username', 'user@example.com');
    await guard.fill('#password', 'password123');
    await guard.click('#login-button');
    
    // Wait for navigation
    await guard.waitForUrl(/dashboard/);
  });

  test('Example 7: Wait for stable element (no animation)', async ({ page }) => {
    const guard = createPageGuard(page);
    
    await page.goto('https://example.com');
    
    // Click button that triggers a modal with animation
    await page.click('#show-modal');
    
    // Wait for modal to stop animating before interacting
    await guard.waitForStable('.modal-dialog', 5000, 3);
    
    // Now safe to click elements in the modal
    await page.click('.modal-dialog #confirm');
  });

  test('Example 8: Verify page state', async ({ page }) => {
    const guard = createPageGuard(page);
    
    await page.goto('https://example.com/login');
    
    // Verify we're on the correct page
    await guard.verify({
      urlPattern: /\/login$/,
      titlePattern: /Login.*Page/,
      timeout: 5000
    });
    
    // Proceed with test
    await guard.fill('#username', 'user@example.com');
  });

  test('Example 9: Retry custom actions', async ({ page }) => {
    const guard = createPageGuard(page, { retryCount: 3 });
    
    await page.goto('https://example.com');
    
    // Retry any custom action
    const userData = await guard.retryAction(async () => {
      // This will be retried if it throws an error
      const response = await page.request.get('/api/user');
      if (!response.ok()) {
        throw new Error('Failed to fetch user data');
      }
      return response.json();
    }, 'fetch user data');
    
    console.log('User data:', userData);
  });

  test('Example 10: Complex real-world scenario', async ({ page }) => {
    // Configure guard for a complex SPA
    const guard = createPageGuard(page, {
      timeout: 15000,
      mode: 'tolerant',
      debug: true,
      waitForNetworkIdle: true,
      mandatorySelectors: ['#app', '#navigation'],
      ignoredSelectors: ['#optional-ad-banner'],
      retryCount: 3,
      retryInterval: 1000
    });
    
    // Navigate to SPA
    await page.goto('https://example.com/app');
    
    // Wait for initial page load
    await guard.waitForReady();
    
    // Wait for app framework to initialize
    await guard.waitForComponent([
      { selector: '#app', state: 'visible', attribute: 'data-initialized', attributeValue: 'true' },
      { selector: '.loading-overlay', state: 'hidden' }
    ]);
    
    // Navigate within SPA
    await guard.click('#nav-dashboard');
    
    // Wait for route to change
    await guard.waitForUrl(/\/dashboard/);
    
    // Wait for dashboard components
    await guard.waitForComponent([
      { selector: '.dashboard-grid', state: 'visible' },
      { selector: '.dashboard-grid', attribute: 'data-loaded', attributeValue: 'true' }
    ]);
    
    // Interact with dashboard
    await guard.click('.widget-settings');
    await guard.waitForStable('.settings-modal');
    await guard.selectOption('#theme-select', 'dark');
    await guard.click('#save-settings');
    
    // Verify changes
    await guard.verify({
      titlePattern: /Dashboard.*Dark Theme/
    });
    
    // Check for any warnings during the process
    const warnings = guard.getWarnings();
    if (warnings.length > 0) {
      console.log('Warnings during test:', warnings);
    }
  });

  test('Example 11: Debugging with debug mode', async ({ page }) => {
    // Enable debug mode to see detailed logs
    const guard = createPageGuard(page, {
      debug: true,
      mandatorySelectors: ['#header', '#main', '#footer']
    });
    
    await page.goto('https://example.com');
    
    // Debug logs will show:
    // - [PageGuard] Waiting for page ready (timeout: 30000ms)
    // - [PageGuard] Checking document.readyState...
    // - [PageGuard] Waiting for load state...
    // - [PageGuard] Checking 3 mandatory selectors...
    // - [PageGuard] Mandatory selector ready: #header
    // - [PageGuard] Mandatory selector ready: #main
    // - [PageGuard] Mandatory selector ready: #footer
    // - [PageGuard] Page is ready
    await guard.waitForReady();
  });
});
