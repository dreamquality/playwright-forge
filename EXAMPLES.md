# Examples

This directory contains practical examples of using playwright-forge fixtures and utilities.

## Basic Examples

### Using API Fixture

```typescript
import { apiFixture } from 'playwright-forge';

apiFixture('Fetch users from API', async ({ api }) => {
  const response = await api.get('https://jsonplaceholder.typicode.com/users');
  expect(response.ok()).toBeTruthy();
  
  const users = await response.json();
  expect(users).toHaveLength(10);
});
```

### Using Data Factory

```typescript
import { test } from '@playwright/test';
import { DataFactory } from 'playwright-forge';

test('Create user with fake data', async ({ page }) => {
  const user = DataFactory.user();
  
  await page.goto('/register');
  await page.fill('#firstName', user.firstName);
  await page.fill('#lastName', user.lastName);
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.click('button[type="submit"]');
});
```

### Using Soft Assertions

```typescript
import { test, expect } from '@playwright/test';
import { softAssertions } from 'playwright-forge';

test('Validate multiple form fields', async ({ page }) => {
  await page.goto('/profile');
  
  const soft = softAssertions();
  
  await soft.assert(async () => {
    const name = await page.textContent('#name');
    expect(name).toBe('John Doe');
  });
  
  await soft.assert(async () => {
    const email = await page.textContent('#email');
    expect(email).toContain('@example.com');
  });
  
  await soft.assert(async () => {
    const status = await page.textContent('#status');
    expect(status).toBe('Active');
  });
  
  // Will report all failures at once
  soft.verify();
});
```

### Using Polling

```typescript
import { test } from '@playwright/test';
import { poll, pollUntilValue } from 'playwright-forge';

test('Wait for async operation', async ({ page }) => {
  await page.goto('/dashboard');
  await page.click('#refresh');
  
  // Poll until element becomes visible
  await poll(
    async () => await page.locator('.success-message').isVisible(),
    { interval: 500, timeout: 10000 }
  );
  
  // Poll until API returns data
  const data = await pollUntilValue(
    async () => {
      const response = await page.evaluate(() => window.fetchData());
      return response;
    },
    { interval: 1000, timeout: 15000 }
  );
});
```

### Using Cleanup Fixture

```typescript
import { test } from '@playwright/test';
import { cleanupFixture } from 'playwright-forge';

cleanupFixture('Create and cleanup test data', async ({ page, cleanup }) => {
  // Create test data
  await page.goto('/admin/create-user');
  await page.fill('#username', 'test_user_123');
  await page.click('#submit');
  
  const userId = await page.getAttribute('#user-id', 'data-id');
  
  // Register cleanup that runs even if test fails
  cleanup.addTask(async () => {
    await page.goto(`/admin/delete-user/${userId}`);
    await page.click('#confirm-delete');
  });
  
  // Rest of test...
  await page.goto(`/users/${userId}`);
  // ... test assertions
});
```

### Using Network Fixture

```typescript
import { networkFixture } from 'playwright-forge';

networkFixture('Intercept and modify API calls', async ({ page, network }) => {
  // Intercept all API calls and add auth header
  await network.interceptRequest('**/api/**', (route) => {
    route.continue({
      headers: {
        ...route.request().headers(),
        'Authorization': 'Bearer test-token',
      },
    });
  });
  
  await page.goto('/dashboard');
  
  // Wait for specific API response
  const responsePromise = network.waitForResponse(/api\/user\/profile/);
  await page.click('#load-profile');
  const response = await responsePromise;
  
  expect(response.status()).toBe(200);
  
  // Cleanup handled automatically
});
```

### Using Page Guard

```typescript
import { test } from '@playwright/test';
import { createPageGuard } from 'playwright-forge';

test('Navigate and verify page state', async ({ page }) => {
  await page.goto('/login');
  
  const guard = createPageGuard(page);
  
  // Fill form
  await page.fill('#username', 'testuser');
  await page.fill('#password', 'password123');
  await page.click('#login');
  
  // Wait for navigation and verify
  await guard.verify({
    urlPattern: /dashboard/,
    titlePattern: /Dashboard/,
    timeout: 5000
  });
  
  // Ensure page is fully loaded
  await guard.waitForReady();
  
  // Guard element before interaction (ensures visible and enabled)
  const settingsButton = await guard.guardElement('#settings-btn');
  await settingsButton.click();
  
  // Wait for animated modal to stabilize
  await guard.waitForStable('.modal');
});
```

### Using JSON Schema Validation

```typescript
import { apiFixture } from 'playwright-forge';
import { validateJsonSchema, assertJsonSchema } from 'playwright-forge';

apiFixture('Validate API response schema', async ({ api }) => {
  const response = await api.get('/api/products/1');
  const product = await response.json();
  
  const productSchema = {
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: { type: 'string' },
      price: { type: 'number', minimum: 0 },
      inStock: { type: 'boolean' },
      tags: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['id', 'name', 'price', 'inStock'],
    additionalProperties: false
  };
  
  // Option 1: Validate and get errors
  const validation = validateJsonSchema(product, productSchema);
  if (!validation.valid) {
    console.log('Validation errors:', validation.errors);
  }
  expect(validation.valid).toBeTruthy();
  
  // Option 2: Assert (throws on failure)
  assertJsonSchema(product, productSchema);
});
```

### Using YAML Loader

```typescript
import { test } from '@playwright/test';
import { loadYaml } from 'playwright-forge';

test('Load test data from YAML', async ({ page }) => {
  interface TestData {
    users: Array<{ email: string; password: string }>;
    baseUrl: string;
  }
  
  const testData = loadYaml<TestData>('test-data/users.yml');
  
  await page.goto(testData.baseUrl + '/login');
  
  for (const user of testData.users) {
    await page.fill('#email', user.email);
    await page.fill('#password', user.password);
    await page.click('#login');
    
    // Verify login...
    
    await page.click('#logout');
  }
});
```

### Using File Assertions

```typescript
import { test } from '@playwright/test';
import { waitForDownload, FileAssertions } from 'playwright-forge';

test('Download and verify file', async ({ page }) => {
  await page.goto('/reports');
  
  const filePath = await waitForDownload(
    page,
    async () => await page.click('#download-report'),
    { targetPath: './downloads/report.pdf' }
  );
  
  // Assert file was downloaded
  FileAssertions.exists(filePath);
  FileAssertions.isNotEmpty(filePath);
  FileAssertions.sizeGreaterThan(filePath, 1000); // At least 1KB
  
  // For text files, you can check content
  // FileAssertions.contentContains(filePath, 'Expected Report Title');
});
```

## Advanced Example: Complete E2E Test

```typescript
import { test as base } from '@playwright/test';
import {
  apiFixture,
  cleanupFixture,
  diagnosticsFixture,
  networkFixture,
  DataFactory,
  validateJsonSchema,
  createPageGuard,
  softAssertions,
  poll
} from 'playwright-forge';

// Combine all fixtures
const test = apiFixture
  .extend(cleanupFixture.fixtures)
  .extend(diagnosticsFixture.fixtures)
  .extend(networkFixture.fixtures);

test('Complete E2E user registration and verification', async ({
  api,
  page,
  cleanup,
  diagnostics,
  network
}) => {
  // Generate test user data
  const testUser = DataFactory.user();
  
  // Step 1: Verify API endpoint is available
  const healthResponse = await api.get('/api/health');
  expect(healthResponse.ok()).toBeTruthy();
  
  // Step 2: Setup network interception to capture registration request
  let registrationPayload: any;
  await network.interceptRequest('**/api/users/register', (route) => {
    registrationPayload = route.request().postDataJSON();
    route.continue();
  });
  
  // Step 3: Fill registration form
  await page.goto('/register');
  await diagnostics.captureScreenshot('registration-page');
  
  const guard = createPageGuard(page);
  await guard.waitForReady();
  
  await page.fill('#firstName', testUser.firstName);
  await page.fill('#lastName', testUser.lastName);
  await page.fill('#email', testUser.email);
  await page.fill('#password', testUser.password);
  
  // Step 4: Submit and wait for success
  const responsePromise = network.waitForResponse(/api\/users\/register/);
  await page.click('button[type="submit"]');
  const response = await responsePromise;
  
  expect(response.status()).toBe(201);
  
  // Step 5: Validate response schema
  const userData = await response.json();
  const userSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      email: { type: 'string' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      createdAt: { type: 'string' }
    },
    required: ['id', 'email', 'firstName', 'lastName']
  };
  validateJsonSchema(userData, userSchema);
  
  // Step 6: Verify UI shows success
  await guard.verify({
    urlPattern: /welcome/,
    titlePattern: /Welcome/
  });
  
  await poll(
    async () => await page.locator('.success-message').isVisible(),
    { interval: 500, timeout: 5000 }
  );
  
  // Step 7: Soft assertions for user data
  const soft = softAssertions();
  await soft.assert(() => expect(userData.email).toBe(testUser.email));
  await soft.assert(() => expect(userData.firstName).toBe(testUser.firstName));
  await soft.assert(() => expect(userData.lastName).toBe(testUser.lastName));
  soft.verify();
  
  // Step 8: Capture success screenshot
  await diagnostics.captureScreenshot('registration-success');
  
  // Step 9: Register cleanup to delete test user
  cleanup.addTask(async () => {
    console.log(`Cleaning up user: ${userData.id}`);
    const deleteResponse = await api.delete(`/api/users/${userData.id}`);
    expect(deleteResponse.ok()).toBeTruthy();
  });
  
  // Test continues with more assertions...
});
```

## Running Examples

To use these examples in your own project:

1. Install playwright-forge:
```bash
npm install playwright-forge @playwright/test
```

2. Create a test file (e.g., `tests/example.spec.ts`)

3. Copy any example from above

4. Run with Playwright:
```bash
npx playwright test
```
