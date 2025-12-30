import { test as base, expect } from '@playwright/test';
import { 
  createPageGuard
} from '../src';
import { apiFixture, cleanupFixture, diagnosticsFixture, networkFixture } from '../src/fixtures';
import * as path from 'path';

const testPagePath = 'file://' + path.join(__dirname, 'fixtures', 'test-page.html');

// We need to manually get the fixture definitions from each extended test
// Since Playwright's fixtures are based on test.extend, we need to extend the base test with all fixtures

// Get the fixture definitions - each xxxFixture is a test object with fixtures
// We'll use apiFixture as base since it already extends base test
const test = apiFixture;

test.describe('Fixtures Tests', () => {
  
  test('API fixture is available', async ({ api }) => {
    expect(api).toBeDefined();
    expect(typeof api.get).toBe('function');
    expect(typeof api.post).toBe('function');
  });
});

// Test cleanup fixture separately  
cleanupFixture.describe('Cleanup Tests', () => {
  cleanupFixture('Cleanup fixture registers and executes tasks', async ({ cleanup }) => {
    let cleanupExecuted = false;
    
    cleanup.addTask(() => {
      cleanupExecuted = true;
    });
    
    expect(cleanupExecuted).toBe(false);
    // Cleanup will execute after test completes
  });
});

// Test diagnostics fixture
diagnosticsFixture.describe('Diagnostics Tests', () => {
  diagnosticsFixture('Diagnostics fixture provides screenshot capability', async ({ page, diagnostics }) => {
    await page.goto(testPagePath);
    const screenshotPath = await diagnostics.captureScreenshot('test-screenshot');
    expect(screenshotPath).toContain('test-screenshot');
  });
});

// Test network fixture
networkFixture.describe('Network Tests', () => {
  networkFixture('Network fixture provides utilities', async ({ network }) => {
    // Verify network utilities are available
    expect(network.waitForResponse).toBeDefined();
    expect(network.interceptRequest).toBeDefined();
    expect(network.clearInterceptions).toBeDefined();
  });
});

// Test page guard with base test
base.describe('Page Guard Tests', () => {
  base('Page guard verifies page state', async ({ page }) => {
    await page.goto(testPagePath);
    
    const guard = createPageGuard(page);
    await guard.waitForReady();
    
    // Verify URL pattern
    await guard.waitForUrl(/test-page\.html/);
    
    // Verify page state
    await guard.verify({
      urlPattern: /test-page\.html/,
      titlePattern: /Example/
    });
  });

  base('Page guard waits for element', async ({ page }) => {
    await page.goto(testPagePath);
    
    const guard = createPageGuard(page);
    const locator = await guard.guardElement('h1');
    
    expect(locator).toBeDefined();
    await expect(locator).toBeVisible();
  });
});
