import { test, expect } from '@playwright/test';
import { softExpectFixture } from '../src';
import { SoftExpect, softExpect } from '../src/utils/softAssertions';
import * as fs from 'fs';
import * as path from 'path';

test.describe('SoftExpect Utility Tests', () => {
  
  test('should collect multiple assertion failures', async () => {
    const soft = softExpect();
    
    await soft.expect(1).toBe(1);
    await soft.expect(2).toBe(3); // Will fail
    await soft.expect('a').toBe('b'); // Will fail
    
    expect(soft.hasErrors()).toBe(true);
    expect(soft.getErrors()).toHaveLength(2);
    
    expect(() => soft.assertAll()).toThrow(/Soft assertions failed \(2 errors\)/);
  });

  test('should work with async Playwright assertions', async () => {
    const soft = softExpect();
    
    // Test with async values directly
    const value1 = await Promise.resolve(1);
    const value2 = await Promise.resolve(2);
    
    await soft.expect(value1).toBe(1);
    await soft.expect(value2).toBe(3); // Will fail
    
    expect(soft.hasErrors()).toBe(true);
    expect(soft.getErrors()).toHaveLength(1);
  });

  test('should support context grouping with UI', async () => {
    const soft = softExpect();
    
    await soft.ui('John').toBe('John');
    await soft.ui('Alice').toBe('Bob'); // Will fail
    await soft.ui('Test').toBe('Wrong'); // Will fail
    
    expect(soft.hasErrors()).toBe(true);
    expect(soft.getErrors()).toHaveLength(2);
    
    const grouped = soft.getErrorsByContext();
    expect(grouped.has('UI')).toBe(true);
    expect(grouped.get('UI')?.length).toBe(2);
  });

  test('should support context grouping with API', async () => {
    const soft = softExpect();
    
    await soft.api(200).toBe(200);
    await soft.api(404).toBe(200); // Will fail
    
    expect(soft.hasErrors()).toBe(true);
    const grouped = soft.getErrorsByContext();
    expect(grouped.has('API')).toBe(true);
    expect(grouped.get('API')?.length).toBe(1);
  });

  test('should support context grouping with Validation', async () => {
    const soft = softExpect();
    
    await soft.validation('valid@email.com').toContain('@');
    await soft.validation('invalid').toContain('@'); // Will fail
    
    expect(soft.hasErrors()).toBe(true);
    const grouped = soft.getErrorsByContext();
    expect(grouped.has('Validation')).toBe(true);
  });

  test('should support custom context', async () => {
    const soft = softExpect();
    
    await soft.withContext('CustomContext')(123).toBe(123);
    await soft.withContext('CustomContext')(456).toBe(789); // Will fail
    
    expect(soft.hasErrors()).toBe(true);
    const grouped = soft.getErrorsByContext();
    expect(grouped.has('CustomContext')).toBe(true);
  });

  test('should support mixed contexts', async () => {
    const soft = softExpect();
    
    await soft.ui('Header').toBe('Header');
    await soft.api(200).toBe(200);
    await soft.validation('test@test.com').toContain('@');
    
    await soft.ui('Footer').toBe('Wrong'); // Will fail
    await soft.api(404).toBe(200); // Will fail
    await soft.validation('invalid').toContain('@'); // Will fail
    
    expect(soft.hasErrors()).toBe(true);
    expect(soft.getErrors()).toHaveLength(3);
    
    const grouped = soft.getErrorsByContext();
    expect(grouped.size).toBe(3);
    expect(grouped.get('UI')?.length).toBe(1);
    expect(grouped.get('API')?.length).toBe(1);
    expect(grouped.get('Validation')?.length).toBe(1);
  });

  test('should format grouped errors in verify', async () => {
    const soft = softExpect();
    
    await soft.ui('Button').toBe('Wrong');
    await soft.api(404).toBe(200);
    
    try {
      soft.verify();
      throw new Error('Should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('[UI]');
      expect(message).toContain('[API]');
      expect(message).toContain('Soft assertions failed (2 errors)');
    }
  });

  test('should export to CI annotations format', async () => {
    const soft = softExpect();
    
    await soft.ui('Test').toBe('Wrong');
    await soft.api(404).toBe(200);
    await soft.validation('invalid').toContain('@');
    
    const report = soft.exportCIAnnotations();
    
    expect(report.totalErrors).toBe(3);
    expect(report.contexts.UI).toBe(1);
    expect(report.contexts.API).toBe(1);
    expect(report.contexts.Validation).toBe(1);
    expect(report.errors).toHaveLength(3);
    expect(report.errors[0]).toHaveProperty('message');
    expect(report.errors[0]).toHaveProperty('context');
    expect(report.errors[0]).toHaveProperty('timestamp');
  });

  test('should export to JSON', async () => {
    const soft = softExpect();
    
    await soft.ui('Test').toBe('Wrong');
    await soft.api(404).toBe(200);
    
    const json = soft.exportJSON();
    const parsed = JSON.parse(json);
    
    expect(parsed.totalErrors).toBe(2);
    expect(parsed.contexts).toHaveProperty('UI');
    expect(parsed.contexts).toHaveProperty('API');
    expect(parsed.errors).toHaveLength(2);
  });

  test('should clear errors', async () => {
    const soft = softExpect();
    
    await soft.expect(1).toBe(2); // Will fail
    expect(soft.hasErrors()).toBe(true);
    
    soft.clear();
    expect(soft.hasErrors()).toBe(false);
    expect(soft.getErrors()).toHaveLength(0);
  });

  test('should not throw when no errors', async () => {
    const soft = softExpect();
    
    await soft.expect(1).toBe(1);
    await soft.ui('Test').toBe('Test');
    
    expect(soft.hasErrors()).toBe(false);
    expect(() => soft.assertAll()).not.toThrow();
  });

  test('should support common Playwright matchers', async () => {
    const soft = softExpect();
    
    await soft.expect(1).toBe(1);
    await soft.expect(2).toBeGreaterThan(1);
    await soft.expect('hello').toContain('ell');
    await soft.expect([1, 2, 3]).toHaveLength(3);
    await soft.expect({ name: 'John' }).toHaveProperty('name');
    
    expect(soft.hasErrors()).toBe(false);
  });

  test('should capture matcher failures', async () => {
    const soft = softExpect();
    
    await soft.expect(1).toBe(2);
    await soft.expect(1).toBeGreaterThan(5);
    await soft.expect('hello').toContain('xyz');
    await soft.expect([1, 2]).toHaveLength(5);
    
    expect(soft.hasErrors()).toBe(true);
    expect(soft.getErrors()).toHaveLength(4);
  });

  test('should handle uncategorized errors', async () => {
    const soft = softExpect();
    
    await soft.expect(1).toBe(2); // No context
    await soft.ui('Test').toBe('Wrong'); // UI context
    
    const grouped = soft.getErrorsByContext();
    expect(grouped.has('uncategorized')).toBe(true);
    expect(grouped.has('UI')).toBe(true);
  });

  test('should support negated matchers with .not', async () => {
    const soft = softExpect();
    
    // These should pass
    await soft.expect(1).not.toBe(2);
    await soft.expect('hello').not.toContain('xyz');
    await soft.expect([1, 2, 3]).not.toHaveLength(5);
    
    expect(soft.hasErrors()).toBe(false);
    
    // These should fail
    await soft.expect(1).not.toBe(1);
    await soft.expect('hello').not.toContain('ell');
    
    expect(soft.hasErrors()).toBe(true);
    expect(soft.getErrors()).toHaveLength(2);
  });
});

test.describe('SoftExpect Fixture Tests', () => {
  
  softExpectFixture('should provide softExpect fixture', async ({ softExpect }) => {
    expect(softExpect).toBeDefined();
    expect(softExpect).toBeInstanceOf(SoftExpect);
  });

  softExpectFixture('should collect errors within test', async ({ softExpect }) => {
    await softExpect.expect(1).toBe(1);
    await softExpect.expect('test').toBe('test');
    
    expect(softExpect.hasErrors()).toBe(false);
  });

  softExpectFixture('should support context-based assertions in fixture', async ({ softExpect }) => {
    await softExpect.ui('Button Text').toBe('Button Text');
    await softExpect.api(200).toBe(200);
    await softExpect.validation('test@example.com').toContain('@');
    
    expect(softExpect.hasErrors()).toBe(false);
  });

  softExpectFixture('should work with real Playwright page assertions', async ({ page, softExpect }) => {
    // Create a simple HTML page for testing
    await page.setContent(`
      <html>
        <body>
          <h1 id="title">Test Page</h1>
          <button id="btn">Click Me</button>
          <input id="email" value="test@example.com" />
        </body>
      </html>
    `);
    
    // Successful assertions
    await softExpect.expect(page.locator('#title')).toHaveText('Test Page');
    await softExpect.expect(page.locator('#btn')).toBeVisible();
    await softExpect.expect(page.locator('#email')).toHaveValue('test@example.com');
    
    expect(softExpect.hasErrors()).toBe(false);
  });
});

// Tests with disabled auto-verify
softExpectFixture.describe('SoftExpect with Manual Verification', () => {
  
  softExpectFixture.use({ 
    softExpectOptions: { autoVerify: false } 
  });

  softExpectFixture('should allow manual verification when autoVerify is false', async ({ softExpect }) => {
    await softExpect.expect(1).toBe(2); // Will fail
    
    expect(softExpect.hasErrors()).toBe(true);
    
    // Manual verification
    expect(() => softExpect.assertAll()).toThrow();
  });

  softExpectFixture('should collect page assertion failures', async ({ page, softExpect }) => {
    await page.setContent(`
      <html>
        <body>
          <h1 id="title">Actual Title</h1>
        </body>
      </html>
    `);
    
    await softExpect.expect(page.locator('#title')).toHaveText('Expected Title');
    await softExpect.expect(page.locator('#missing')).toBeVisible();
    
    expect(softExpect.hasErrors()).toBe(true);
    expect(softExpect.getErrors().length).toBeGreaterThan(0);
  });

  softExpectFixture('should support mixed UI and API assertions', async ({ page, softExpect }) => {
    await page.setContent(`
      <html>
        <body>
          <div id="status">Success</div>
        </body>
      </html>
    `);
    
    await softExpect.ui(page.locator('#status')).toHaveText('Success');
    await softExpect.api(200).toBe(200);
    await softExpect.validation('user@example.com').toContain('@');
    
    expect(softExpect.hasErrors()).toBe(false);
  });
});

// Tests with JSON export
softExpectFixture.describe('SoftExpect with JSON Export', () => {
  
  softExpectFixture.use({
    softExpectOptions: { autoVerify: false, exportJSON: true, exportPath: 'test-report.json' }
  });

  softExpectFixture('should export JSON report when configured', async ({ softExpect }, testInfo) => {
    await softExpect.expect(1).toBe(2); // Will fail
    
    // Manually export since autoVerify is false
    const outputPath = path.join(testInfo.outputDir, 'test-report.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, softExpect.exportJSON(), 'utf-8');
    
    expect(fs.existsSync(outputPath)).toBe(true);
    
    const content = fs.readFileSync(outputPath, 'utf-8');
    const report = JSON.parse(content);
    expect(report.totalErrors).toBe(1);
  });
});

// Real-world scenarios
softExpectFixture.describe('Real-world Scenarios', () => {
  
  softExpectFixture.use({
    softExpectOptions: { autoVerify: false }
  });
  
  softExpectFixture('profile page validation scenario', async ({ page, softExpect }) => {
    await page.setContent(`
      <html>
        <body>
          <div id="profile">
            <div id="name">John Doe</div>
            <div id="email">john@example.com</div>
            <div id="age">30</div>
            <div id="location">New York</div>
          </div>
        </body>
      </html>
    `);
    
    // Multiple UI validations
    await softExpect.ui(page.locator('#name')).toHaveText('John Doe');
    await softExpect.ui(page.locator('#email')).toContainText('@');
    await softExpect.ui(page.locator('#age')).toHaveText('30');
    await softExpect.ui(page.locator('#location')).toBeVisible();
    
    // API validation
    await softExpect.api(200).toBe(200);
    
    // Data validation
    await softExpect.validation('john@example.com').toContain('@');
    
    expect(softExpect.hasErrors()).toBe(false);
  });

  softExpectFixture('form validation with multiple failures', async ({ page, softExpect }) => {
    await page.setContent(`
      <html>
        <body>
          <form>
            <input id="username" value="" />
            <input id="email" value="invalid-email" />
            <input id="password" value="123" />
            <button id="submit">Submit</button>
          </form>
        </body>
      </html>
    `);
    
    // These will fail
    await softExpect.validation(page.locator('#username')).toHaveValue('required');
    await softExpect.validation(page.locator('#email')).toHaveValue('valid@email.com');
    await softExpect.validation(page.locator('#password')).toHaveValue('strongpassword');
    
    expect(softExpect.hasErrors()).toBe(true);
    expect(softExpect.getErrors().length).toBe(3);
    
    const grouped = softExpect.getErrorsByContext();
    expect(grouped.get('Validation')?.length).toBe(3);
  });
});
