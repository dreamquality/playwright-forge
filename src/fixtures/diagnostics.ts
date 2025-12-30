import { test as base, TestInfo } from '@playwright/test';
import * as path from 'path';

export type DiagnosticsOptions = {
  captureScreenshot: (name?: string) => Promise<string>;
};

/**
 * Diagnostics fixture for capturing screenshots on failure
 * Automatically captures screenshot when test fails
 * Parallel-safe with unique file naming
 */
export const diagnosticsFixture = base.extend<{ diagnostics: DiagnosticsOptions }>({
  diagnostics: async ({ page }, use, testInfo: TestInfo) => {
    const diagnostics: DiagnosticsOptions = {
      captureScreenshot: async (name?: string) => {
        const screenshotName = name || `screenshot-${Date.now()}.png`;
        const screenshotPath = path.join(testInfo.outputDir, screenshotName);
        
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });
        } catch (error) {
          // Fallback to viewport screenshot if fullPage fails
          await page.screenshot({ path: screenshotPath, type: 'png' });
        }
        
        testInfo.attach(screenshotName, {
          path: screenshotPath,
          contentType: 'image/png',
        });
        return screenshotPath;
      },
    };

    await use(diagnostics);

    // Auto-capture screenshot on failure
    if (testInfo.status !== testInfo.expectedStatus) {
      try {
        const screenshotPath = path.join(testInfo.outputDir, 'failure-screenshot.png');
        
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true, type: 'png' });
        } catch (error) {
          // Fallback to viewport screenshot if fullPage fails
          await page.screenshot({ path: screenshotPath, type: 'png' });
        }
        
        testInfo.attach('failure-screenshot', {
          path: screenshotPath,
          contentType: 'image/png',
        });
      } catch (error) {
        console.error('Failed to capture failure screenshot:', error);
      }
    }
  },
});
