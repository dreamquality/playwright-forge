import { test as base } from '@playwright/test';
import { SoftExpect } from '../utils/softAssertions';

/**
 * Options for soft expect fixture
 */
export type SoftExpectOptions = {
  /**
   * Whether to automatically call assertAll in afterEach
   * Default: true
   */
  autoVerify?: boolean;
  
  /**
   * Whether to export errors to JSON file on failure
   * Default: false
   */
  exportJSON?: boolean;
  
  /**
   * Path to export JSON report (relative to test results directory)
   * Default: 'soft-assertions.json'
   */
  exportPath?: string;
};

/**
 * Soft expect fixture providing soft assertions with automatic verification
 * Integrates with Playwright test lifecycle
 * Parallel-safe with per-test isolation
 */
export const softExpectFixture = base.extend<{ 
  softExpect: SoftExpect;
  softExpectOptions: SoftExpectOptions;
}>({
  // Options fixture with defaults
  softExpectOptions: [{
    autoVerify: true,
    exportJSON: false,
    exportPath: 'soft-assertions.json',
  }, { option: true }],

  // Main soft expect fixture
  softExpect: async ({ softExpectOptions }, use, testInfo) => {
    const softExpect = new SoftExpect();

    // Provide soft expect to the test
    await use(softExpect);

    // Auto-verify in teardown if enabled
    if (softExpectOptions.autoVerify && softExpect.hasErrors()) {
      // Export to JSON if enabled
      if (softExpectOptions.exportJSON) {
        const fs = await import('fs');
        const path = await import('path');
        
        const outputDir = testInfo.outputDir;
        const outputPath = path.join(outputDir, softExpectOptions.exportPath ?? 'soft-assertions.json');
        
        // Ensure output directory exists
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        
        // Write JSON report
        fs.writeFileSync(outputPath, softExpect.exportJSON(), 'utf-8');
        
        // Attach to test results
        testInfo.attachments.push({
          name: 'soft-assertions-report',
          path: outputPath,
          contentType: 'application/json',
        });
      }

      // Verify and fail the test
      softExpect.assertAll();
    }
  },
});
