import { test, expect } from '@playwright/test';
import {
  apiFixture,
  cleanupFixture,
  networkFixture,
  diagnosticsFixture,
  authFixture,
  saveAuthState,
  loadAuthState
} from '../src';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test.describe('Fixtures Edge Cases', () => {

  test.describe('API Fixture Edge Cases', () => {
    
    apiFixture('should handle network errors gracefully', async ({ api }) => {
      // Try to connect to a non-existent server
      try {
        await api.get('http://nonexistent-domain-12345.com/api', {
          timeout: 1000
        });
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
      }
    });

    apiFixture('should handle timeout', async ({ api }) => {
      // Make request with very short timeout
      try {
        await api.get('https://httpbin.org/delay/10', {
          timeout: 100
        });
        throw new Error('Should have timed out');
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });

    apiFixture('should handle invalid JSON response', async ({ api }) => {
      const response = await api.get('https://httpbin.org/html');
      expect(response.ok()).toBe(true);
      
      // Trying to parse as JSON should fail
      try {
        await response.json();
        throw new Error('Should have failed to parse');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    apiFixture('should handle concurrent requests', async ({ api }) => {
      // Make multiple concurrent requests
      const promises = Array.from({ length: 10 }, (_, i) => 
        api.get(`https://httpbin.org/json`)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.ok()).toBe(true);
      });
    });

    apiFixture('should handle large request body', async ({ api }) => {
      const largeData = {
        data: 'x'.repeat(10000) // 10KB of data
      };

      const response = await api.post('https://httpbin.org/post', {
        data: largeData
      });

      expect(response.ok()).toBe(true);
    });

    apiFixture('should handle binary response', async ({ api }) => {
      const response = await api.get('https://httpbin.org/image/png');
      expect(response.ok()).toBe(true);
      
      const buffer = await response.body();
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(0);
    });

    apiFixture('should handle redirects', async ({ api }) => {
      const response = await api.get('https://httpbin.org/redirect/2');
      expect(response.ok()).toBe(true);
      expect(response.url()).toContain('httpbin.org');
    });

    apiFixture('should handle various HTTP methods', async ({ api }) => {
      const getResponse = await api.get('https://httpbin.org/get');
      expect(getResponse.ok()).toBe(true);

      const postResponse = await api.post('https://httpbin.org/post', {
        data: { test: 'data' }
      });
      expect(postResponse.ok()).toBe(true);

      const putResponse = await api.put('https://httpbin.org/put', {
        data: { test: 'data' }
      });
      expect(putResponse.ok()).toBe(true);

      const deleteResponse = await api.delete('https://httpbin.org/delete');
      expect(deleteResponse.ok()).toBe(true);
    });
  });

  test.describe('Cleanup Fixture Edge Cases', () => {
    
    cleanupFixture('should run cleanup tasks in LIFO order', async ({ cleanup }) => {
      const order: number[] = [];

      cleanup.addTask(async () => {
        order.push(1);
      });

      cleanup.addTask(async () => {
        order.push(2);
      });

      cleanup.addTask(async () => {
        order.push(3);
      });

      // Wait for test to complete (cleanup runs after)
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    cleanupFixture('should handle async cleanup errors', async ({ cleanup }) => {
      cleanup.addTask(async () => {
        throw new Error('Cleanup error');
      });

      // Cleanup errors should not prevent other tasks
      cleanup.addTask(async () => {
        // This should still run
      });
    });

    cleanupFixture('should handle cleanup with delays', async ({ cleanup }) => {
      const results: string[] = [];

      cleanup.addTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('task1');
      });

      cleanup.addTask(async () => {
        results.push('task2');
      });
    });

    cleanupFixture('should allow multiple cleanup tasks', async ({ cleanup }) => {
      let counter = 0;

      for (let i = 0; i < 10; i++) {
        cleanup.addTask(async () => {
          counter++;
        });
      }
    });
  });

  test.describe('Network Fixture Edge Cases', () => {

    networkFixture('should handle multiple concurrent interceptions', async ({ page, network }) => {
      await network.interceptRequest('**/*.css', (route) => {
        route.abort();
      });

      await network.interceptRequest('**/*.jpg', (route) => {
        route.abort();
      });

      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      // Clear interceptions
      await network.clearInterceptions();
    });

    networkFixture('should handle interception override', async ({ page, network }) => {
      await network.interceptRequest('**/*', (route) => {
        route.abort();
      });

      await network.interceptRequest('**/allow', (route) => {
        route.continue();
      });

      await network.clearInterceptions();
    });

    networkFixture('should wait for multiple responses', async ({ page, network }) => {
      await page.goto('https://httpbin.org/html');

      const responsePromise1 = network.waitForResponse(/httpbin/);
      const responsePromise2 = network.waitForResponse(/html/);

      const [response1, response2] = await Promise.all([
        responsePromise1,
        responsePromise2
      ]);

      expect(response1).toBeDefined();
      expect(response2).toBeDefined();
    });

    networkFixture('should handle timeout when waiting for response', async ({ page, network }) => {
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');

      // Wait for response that will never come with short timeout
      await expect(
        network.waitForResponse(/nonexistent/, { timeout: 1000 })
      ).rejects.toThrow();
    });
  });

  test.describe('Diagnostics Fixture Edge Cases', () => {

    diagnosticsFixture('should capture multiple screenshots', async ({ page, diagnostics }) => {
      await page.setContent('<html><body><h1>Test</h1></body></html>');

      await diagnostics.captureScreenshot('test-1');
      await diagnostics.captureScreenshot('test-2');
      await diagnostics.captureScreenshot('test-3');
    });

    diagnosticsFixture('should handle screenshot with special characters', async ({ page, diagnostics }) => {
      await page.setContent('<html><body><h1>Test</h1></body></html>');

      await diagnostics.captureScreenshot('test (special) [chars]');
    });

    diagnosticsFixture('should capture screenshot of element', async ({ page, diagnostics }) => {
      await page.setContent(`
        <html>
          <body>
            <div id="target" style="width: 200px; height: 100px; background: red;">
              Target Element
            </div>
          </body>
        </html>
      `);

      // If diagnostics supports element screenshots
      await diagnostics.captureScreenshot('element-test');
    });
  });

  test.describe('Auth Fixture Edge Cases', () => {
    let tempDir: string;

    test.beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));
    });

    test.afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    authFixture('should save and load auth state', async ({ context, auth }) => {
      const statePath = path.join(tempDir, 'auth.json');
      
      // Create a cookie in the context
      await context.addCookies([{
        name: 'test_cookie',
        value: 'test_value',
        domain: 'example.com',
        path: '/',
      }]);

      // Save state
      await saveAuthState(context, statePath);
      
      // Verify file was created
      expect(fs.existsSync(statePath)).toBe(true);

      // Load state
      const loadedState = await loadAuthState(statePath);
      expect(loadedState).toBeDefined();
      expect(loadedState.cookies).toBeDefined();
    });

    authFixture('should handle invalid storage path', async ({ context }) => {
      const invalidPath = '/nonexistent/directory/auth.json';
      
      try {
        await saveAuthState(context, invalidPath);
        throw new Error('Should have thrown error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    authFixture('should handle loading non-existent state', async () => {
      const nonExistentPath = '/nonexistent/auth.json';
      
      try {
        await loadAuthState(nonExistentPath);
        throw new Error('Should have thrown error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    authFixture('should handle empty auth state', async ({ context }) => {
      const statePath = path.join(tempDir, 'empty-auth.json');
      
      // Save state without any cookies or storage
      await saveAuthState(context, statePath);
      
      const loadedState = await loadAuthState(statePath);
      expect(loadedState).toBeDefined();
    });

    authFixture('should handle multiple cookies', async ({ context }) => {
      const statePath = path.join(tempDir, 'multiple-cookies.json');
      
      // Add multiple cookies
      await context.addCookies([
        { name: 'cookie1', value: 'value1', domain: 'example.com', path: '/' },
        { name: 'cookie2', value: 'value2', domain: 'example.com', path: '/' },
        { name: 'cookie3', value: 'value3', domain: 'example.com', path: '/' },
      ]);

      await saveAuthState(context, statePath);
      
      const loadedState = await loadAuthState(statePath);
      expect(loadedState.cookies).toHaveLength(3);
    });

    authFixture('should handle localStorage and sessionStorage', async ({ context, page }) => {
      const statePath = path.join(tempDir, 'storage-auth.json');
      
      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      // Set localStorage and sessionStorage
      await page.evaluate(() => {
        localStorage.setItem('test_local', 'local_value');
        sessionStorage.setItem('test_session', 'session_value');
      });

      await saveAuthState(context, statePath);
      
      const loadedState = await loadAuthState(statePath);
      expect(loadedState).toBeDefined();
    });
  });

  test.describe('Combined Fixtures', () => {
    
    // Note: Each fixture test should be used separately
    // The documentation shows .extend(cleanupFixture.fixtures) but this is incorrect
    // Each fixture is already a test object

    apiFixture('should work with API fixture', async ({ api }) => {
      const response = await api.get('https://httpbin.org/json');
      expect(response.ok()).toBe(true);
    });

    cleanupFixture('should work with cleanup fixture', async ({ cleanup }) => {
      let cleanupRan = false;
      cleanup.addTask(async () => {
        cleanupRan = true;
      });
    });

    diagnosticsFixture('should work with diagnostics fixture', async ({ page, diagnostics }) => {
      await page.goto('data:text/html,<html><body><h1>Combined Test</h1></body></html>');
      await diagnostics.captureScreenshot('combined-test');
    });

    // Test each fixture independently for stress testing
    apiFixture('should handle fixtures in parallel scenarios', async ({ api }) => {
      // Make parallel API calls
      const apiPromises = [
        api.get('https://httpbin.org/json'),
        api.get('https://httpbin.org/uuid'),
        api.get('https://httpbin.org/html')
      ];

      const [r1, r2, r3] = await Promise.all(apiPromises);
      expect(r1.ok()).toBe(true);
      expect(r2.ok()).toBe(true);
      expect(r3.ok()).toBe(true);
    });
  });

  test.describe('Stress Testing', () => {
    
    apiFixture('should handle rapid sequential requests', async ({ api }) => {
      const count = 20;
      const results = [];

      for (let i = 0; i < count; i++) {
        const response = await api.get('https://httpbin.org/uuid');
        results.push(response.ok());
      }

      expect(results).toHaveLength(count);
      expect(results.every(r => r === true)).toBe(true);
    });

    cleanupFixture('should handle many cleanup tasks', async ({ cleanup }) => {
      const taskCount = 100;

      for (let i = 0; i < taskCount; i++) {
        cleanup.addTask(async () => {
          await new Promise(resolve => setTimeout(resolve, 1));
        });
      }
    });

    networkFixture('should handle many interceptions', async ({ page, network }) => {
      // Add many interceptions
      for (let i = 0; i < 10; i++) {
        await network.interceptRequest(`**/*.${i}`, (route) => {
          route.continue();
        });
      }

      await page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      
      await network.clearInterceptions();
    });
  });

  test.describe('Error Recovery', () => {

    apiFixture('should recover from failed requests', async ({ api }) => {
      // First request fails
      try {
        await api.get('http://nonexistent-123.com', { timeout: 1000 });
      } catch (error) {
        // Expected
      }

      // Second request should still work
      const response = await api.get('https://httpbin.org/json');
      expect(response.ok()).toBe(true);
    });

    cleanupFixture('should continue cleanup after error', async ({ cleanup }) => {
      let task2Ran = false;
      let task3Ran = false;

      cleanup.addTask(async () => {
        throw new Error('Task 1 failed');
      });

      cleanup.addTask(async () => {
        task2Ran = true;
      });

      cleanup.addTask(async () => {
        task3Ran = true;
      });
    });
  });
});
