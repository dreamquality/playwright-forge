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

## OpenAPI Schema Validation

### Basic Usage with Remote OpenAPI Spec

```typescript
import { test, expect } from '@playwright/test';
import { apiFixture, validateResponse } from 'playwright-forge';

apiFixture('Validate user API response', async ({ api }) => {
  const response = await api.get('https://api.example.com/users/123');
  const responseBody = await response.json();

  // Validate against OpenAPI spec
  const result = await validateResponse({
    spec: 'https://api.example.com/openapi.yaml',
    path: '/users/{id}',
    method: 'get',
    status: 200,
    responseBody
  });

  expect(result.valid).toBe(true);
  if (!result.valid) {
    console.log('Validation errors:', result.errors);
  }
});
```

### Using Local OpenAPI Spec File

```typescript
import { assertValidResponse } from 'playwright-forge';

test('Validate product API with local spec', async ({ request }) => {
  const response = await request.get('https://api.example.com/products/456');
  const responseBody = await response.json();

  // Throws error if validation fails
  await assertValidResponse({
    spec: './specs/openapi.json', // Local file path
    path: '/products/{id}',
    method: 'get',
    status: 200,
    responseBody
  });
});
```

### Using Loaded OpenAPI Spec Object

```typescript
import { OpenApiValidator } from 'playwright-forge';
import { loadYaml } from 'playwright-forge';

test('Validate with pre-loaded spec', async ({ request }) => {
  // Load spec once
  const spec = loadYaml('./specs/openapi.yaml');
  
  // Create validator instance for reuse
  const validator = new OpenApiValidator();

  // Test multiple endpoints
  const userResponse = await request.get('/users/1');
  const userResult = await validator.validateResponse({
    spec,
    path: '/users/{id}',
    method: 'get',
    status: 200,
    responseBody: await userResponse.json()
  });
  expect(userResult.valid).toBe(true);

  const productsResponse = await request.get('/products');
  const productsResult = await validator.validateResponse({
    spec,
    path: '/products',
    method: 'get',
    status: 200,
    responseBody: await productsResponse.json()
  });
  expect(productsResult.valid).toBe(true);
});
```

### Strict Mode Validation

```typescript
// Reject additional properties not in schema
await assertValidResponse({
  spec: openapiSpec,
  path: '/users/{id}',
  method: 'get',
  status: 200,
  responseBody,
  strict: true // Fails if extra fields present
});
```

### Custom AJV Options

```typescript
const validator = new OpenApiValidator({
  allErrors: true,
  verbose: true,
  strict: 'log'
});

const result = await validator.validateResponse({
  spec: openapiSpec,
  path: '/users/{id}',
  method: 'post',
  status: 201,
  responseBody
});
```

### Handling Validation Errors

```typescript
const result = await validateResponse({
  spec: 'https://api.example.com/openapi.yaml',
  path: '/users/{id}',
  method: 'get',
  status: 200,
  responseBody
});

if (!result.valid) {
  console.error('Validation failed for:', {
    path: result.path,
    method: result.method,
    status: result.status
  });
  
  console.error('Errors:');
  result.errors.forEach(err => console.error('  -', err));
  
  console.error('Expected schema:', JSON.stringify(result.schema, null, 2));
  
  // Access raw AJV errors for detailed info
  if (result.ajvErrors) {
    console.error('AJV errors:', result.ajvErrors);
  }
}
```

### Complete API Test Example

```typescript
import { test, expect } from '@playwright/test';
import { apiFixture, DataFactory, assertValidResponse } from 'playwright-forge';

const openapiSpec = 'https://api.example.com/openapi.yaml';

apiFixture('Complete user API test', async ({ api, cleanup }) => {
  // Generate test data
  const newUser = DataFactory.user();

  // Create user
  const createResponse = await api.post('https://api.example.com/users', {
    data: {
      name: `${newUser.firstName} ${newUser.lastName}`,
      email: newUser.email
    }
  });

  // Validate creation response
  await assertValidResponse({
    spec: openapiSpec,
    path: '/users',
    method: 'post',
    status: 201,
    responseBody: await createResponse.json()
  });

  const userId = (await createResponse.json()).id;

  // Get user
  const getResponse = await api.get(`https://api.example.com/users/${userId}`);
  
  // Validate get response
  await assertValidResponse({
    spec: openapiSpec,
    path: '/users/{id}',
    method: 'get',
    status: 200,
    responseBody: await getResponse.json()
  });

  // Cleanup
  cleanup.addTask(async () => {
    await api.delete(`https://api.example.com/users/${userId}`);
  });
});
```

### Cache Management

```typescript
import { OpenApiValidator } from 'playwright-forge';

test.beforeAll(() => {
  // Clear spec cache before test suite
  OpenApiValidator.clearCache();
});

test('Validate without caching', async ({ request }) => {
  const response = await request.get('/users/1');
  
  // Don't cache this spec
  await assertValidResponse({
    spec: 'https://api.example.com/openapi.yaml',
    path: '/users/{id}',
    method: 'get',
    status: 200,
    responseBody: await response.json(),
    cacheSpec: false
  });
});
```

## Enhanced OpenAPI Matcher (One-Liner API)

### One-Liner API with Auto-Detection

```typescript
import { test } from '@playwright/test';
import { expectApiResponse } from 'playwright-forge';

test('validate API with one-liner', async ({ request }) => {
  const response = await request.get('https://api.example.com/users/123');
  
  // Auto-detects method, path, status from response!
  const result = await expectApiResponse(response).toMatchOpenApiSchema({
    spec: 'https://api.example.com/openapi.yaml'
  });
  
  expect(result.valid).toBe(true);
});
```

### With Manual Overrides

```typescript
// Override auto-detected values if needed
const result = await expectApiResponse(response).toMatchOpenApiSchema({
  spec: './openapi.json',
  method: 'get',  // Optional override
  path: '/users/123',  // Optional override
  status: 200  // Optional override
});
```

### Advanced Configuration

```typescript
import { OpenApiMatcher } from 'playwright-forge';

// Create matcher with custom configuration
const matcher = new OpenApiMatcher({
  strict: true,  // Reject additional properties
  enableCache: true,  // Enable spec caching
  cacheTTL: 60000,  // Cache for 60 seconds
  debug: true,  // Enable debug logging
  ajvOptions: {
    allErrors: true,
    verbose: true
  }
});

test('advanced validation', async ({ request }) => {
  const response = await request.post('https://api.example.com/users', {
    data: { name: 'John', email: 'john@example.com' }
  });
  
  const result = await matcher.validateResponse(
    response,
    'https://api.example.com/openapi.yaml',
    {
      method: 'post',
      path: '/users',
      status: 201
    }
  );
  
  if (!result.valid) {
    console.log('Validation errors:', result.errors);
    console.log('Expected schema:', result.schema);
  }
});
```

### Custom Path Resolver

```typescript
// Custom logic for matching API paths
const matcher = new OpenApiMatcher({
  pathResolver: (templatePath, actualPath) => {
    // Case-insensitive matching
    return templatePath.toLowerCase() === actualPath.toLowerCase();
  }
});
```

### Custom Error Formatter

```typescript
const matcher = new OpenApiMatcher({
  errorFormatter: (errors, context) => {
    return `Validation failed for ${context.method.toUpperCase()} ${context.path}:\n` +
      errors.map(err => `- ${err.message}`).join('\n');
  }
});
```

### Cache Management

```typescript
import { OpenApiMatcher } from 'playwright-forge';

// Check cache size
console.log('Cache entries:', OpenApiMatcher.getCacheSize());

// Clear entire cache
OpenApiMatcher.clearCache();

// Clear specific spec from cache
OpenApiMatcher.clearCache('https://api.example.com/openapi.yaml');

// Disable caching for specific validation
const matcher = new OpenApiMatcher({ enableCache: false });
```

### Per-Worker Cache

The OpenAPI matcher uses per-worker in-memory caching, making it parallel-safe:

```typescript
// Each Playwright worker has its own cache
// No race conditions or shared state issues

test.describe.parallel('parallel tests', () => {
  test('test 1', async ({ request }) => {
    // Uses worker 1's cache
    const response = await request.get('/api/users/1');
    await expectApiResponse(response).toMatchOpenApiSchema({
      spec: './openapi.yaml'
    });
  });
  
  test('test 2', async ({ request }) => {
    // Uses worker 2's cache (independent)
    const response = await request.get('/api/products/1');
    await expectApiResponse(response).toMatchOpenApiSchema({
      spec: './openapi.yaml'
    });
  });
});
```

### Complete Example with All Features

```typescript
import { test, expect } from '@playwright/test';
import { OpenApiMatcher, expectApiResponse } from 'playwright-forge';

// Global matcher with configuration
const matcher = new OpenApiMatcher({
  strict: false,
  allowAdditionalProperties: true,
  enableCache: true,
  cacheTTL: 300000,  // 5 minutes
  debug: process.env.DEBUG === 'true',
  pathResolver: (template, actual) => {
    // Custom path matching logic
    const pattern = template.replace(/{[^}]+}/g, '[^/]+');
    return new RegExp(`^${pattern}$`).test(actual);
  },
  errorFormatter: (errors, context) => {
    return `❌ OpenAPI Validation Failed\n` +
      `  ${context.method.toUpperCase()} ${context.path} (${context.status})\n\n` +
      `Errors:\n` +
      errors.map(err => `  • ${err.instancePath || 'root'}: ${err.message}`).join('\n');
  }
});

test.describe('API Tests with OpenAPI Validation', () => {
  const specPath = './specs/openapi.yaml';
  
  test.beforeAll(() => {
    // Pre-load spec into cache
    matcher.loadSpec(specPath);
  });
  
  test.afterAll(() => {
    // Clear cache after tests
    OpenApiMatcher.clearCache();
  });
  
  test('validate user creation', async ({ request }) => {
    const response = await request.post('https://api.example.com/users', {
      data: {
        name: 'Jane Doe',
        email: 'jane@example.com'
      }
    });
    
    // One-liner validation
    const result = await expectApiResponse(response).toMatchOpenApiSchema({
      spec: specPath,
      status: 201  // Override if needed
    });
    
    expect(result.valid).toBe(true);
    expect(result.context?.schema).toBeDefined();
  });
  
  test('validate user retrieval', async ({ request }) => {
    const response = await request.get('https://api.example.com/users/123');
    
    // Using configured matcher
    const result = await matcher.validateResponse(response, specPath);
    
    if (!result.valid) {
      console.error(result.message);
      console.error('Schema:', JSON.stringify(result.schema, null, 2));
    }
    
    expect(result.valid).toBe(true);
  });
  
  test('handle validation errors gracefully', async ({ request }) => {
    const response = await request.get('https://api.example.com/invalid');
    
    const result = await expectApiResponse(response).toMatchOpenApiSchema({
      spec: specPath,
      strict: true
    });
    
    // Even if validation fails, we get detailed error info
    if (!result.valid) {
      expect(result.errors).toBeDefined();
      expect(result.message).toContain('validation');
      expect(result.context).toBeDefined();
    }
  });
});
```

## OpenAPI Resilient Validation

### Handling Incomplete or Broken Specs

The OpenAPI validation utilities can handle incomplete or broken specifications gracefully:

#### Basic Resilient Validation

```typescript
import { test } from '@playwright/test';
import { validateResponse, expectApiResponse } from 'playwright-forge';

test('Validate with incomplete spec - warn mode', async ({ request }) => {
  const response = await request.get('/api/users/123');
  
  const result = await validateResponse({
    spec: './incomplete-openapi.yaml',
    path: '/users/{id}',
    method: 'get',
    status: 200,
    responseBody: await response.json(),
    // Skip validation if schema missing, log warning
    fallbackMode: 'warn'
  });
  
  // Check if validation was skipped
  if (result.skipped) {
    console.log('Validation skipped:', result.warnings);
  }
  
  expect(result.valid).toBe(true);
});

test('Validate with loose fallback', async ({ request }) => {
  const response = await request.get('/api/users/123');
  
  const result = await validateResponse({
    spec: './broken-spec.yaml',
    path: '/users/{id}',
    method: 'get',
    status: 200,
    responseBody: await response.json(),
    // Use basic type validation if schema missing
    fallbackMode: 'loose',
    allowBrokenRefs: true
  });
  
  if (result.fallbackUsed) {
    console.log('Used loose validation');
  }
  
  expect(result.valid).toBe(true);
});
```

#### Strict Mode vs Tolerant Mode

```typescript
import { test } from '@playwright/test';
import { validateResponse } from 'playwright-forge';

// Strict mode - fail fast
test('Strict validation - fail on any issue', async ({ request }) => {
  const response = await request.get('/api/products');
  
  const result = await validateResponse({
    spec: './openapi.yaml',
    path: '/products',
    method: 'get',
    status: 200,
    responseBody: await response.json(),
    failOnMissingSchema: true,  // Fail if schema not found
    allowBrokenRefs: false,      // Fail on broken $ref
    warnOnly: false              // Fail on validation errors
  });
  
  expect(result.valid).toBe(true);
});

// Tolerant mode - for gradual adoption
test('Tolerant validation - gradual OpenAPI adoption', async ({ request }) => {
  const response = await request.get('/api/products');
  
  const result = await validateResponse({
    spec: './partial-openapi.yaml',
    path: '/products',
    method: 'get',
    status: 200,
    responseBody: await response.json(),
    failOnMissingSchema: false,      // Don't fail if schema missing
    fallbackMode: 'warn',             // Warn and skip
    allowUnknownResponses: true,      // Allow undocumented status codes
    allowBrokenRefs: true,            // Continue with broken refs
    warnOnly: true                    // Never fail, just warn
  });
  
  // Always passes, but logs warnings
  expect(result.valid).toBe(true);
  
  if (result.warnings && result.warnings.length > 0) {
    console.log('Validation warnings:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }
});
```

#### Debug Mode

```typescript
import { test } from '@playwright/test';
import { expectApiResponse } from 'playwright-forge';

test('Debug OpenAPI resolution', async ({ request }) => {
  const response = await request.get('/api/users/123');
  
  const result = await expectApiResponse(response).toMatchOpenApiSchema({
    spec: './openapi.yaml',
    // Enable detailed logging
    debugResolution: true,
    fallbackMode: 'loose',
    allowBrokenRefs: true
  });
  
  // Console will show:
  // [OpenApiMatcher] Validating: GET /users/123 (200)
  // [OpenApiMatcher] Loading spec from file: ...
  // [OpenApiMatcher] Resolving $ref: #/components/schemas/User
  // [OpenApiMatcher] Successfully resolved $ref
  // [OpenApiMatcher] Found path: /users/{id}
  // [OpenApiMatcher] Found method: get
  // [OpenApiMatcher] Successfully extracted schema
});
```

#### Fallback Modes Comparison

```typescript
import { test, expect } from '@playwright/test';
import { validateResponse } from 'playwright-forge';

const incompleteSpec = {
  openapi: '3.0.0',
  info: { title: 'Incomplete API', version: '1.0.0' },
  paths: {} // No paths defined
};

const responseBody = { id: 123, name: 'Test', extra: 'field' };

test('fallbackMode: none - skip silently', async () => {
  const result = await validateResponse({
    spec: incompleteSpec,
    path: '/users',
    method: 'get',
    status: 200,
    responseBody,
    fallbackMode: 'none'
  });
  
  expect(result.valid).toBe(true);
  expect(result.skipped).toBe(true);
  // No warnings logged
});

test('fallbackMode: warn - skip with warning', async () => {
  const result = await validateResponse({
    spec: incompleteSpec,
    path: '/users',
    method: 'get',
    status: 200,
    responseBody,
    fallbackMode: 'warn'
  });
  
  expect(result.valid).toBe(true);
  expect(result.skipped).toBe(true);
  expect(result.warnings).toBeDefined();
  // Warnings logged to console
});

test('fallbackMode: loose - type-only validation', async () => {
  const result = await validateResponse({
    spec: incompleteSpec,
    path: '/users',
    method: 'get',
    status: 200,
    responseBody,
    fallbackMode: 'loose'
  });
  
  expect(result.valid).toBe(true);
  expect(result.fallbackUsed).toBe(true);
  expect(result.schema).toEqual({
    type: 'object',
    additionalProperties: true
  });
  // Validates only that response is an object
});
```

#### Handling Broken $refs

```typescript
import { test } from '@playwright/test';
import { validateResponse } from 'playwright-forge';

const specWithBrokenRefs = {
  openapi: '3.0.0',
  info: { title: 'API', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/UserDoesNotExist'
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      // UserDoesNotExist is not defined
    }
  }
};

test('Handle broken $ref gracefully', async ({ request }) => {
  const response = await request.get('/api/users');
  
  const result = await validateResponse({
    spec: specWithBrokenRefs,
    path: '/users',
    method: 'get',
    status: 200,
    responseBody: await response.json(),
    allowBrokenRefs: true,  // Don't throw on broken refs
    debugResolution: true   // Log what happens
  });
  
  // Uses permissive fallback schema
  expect(result.valid).toBe(true);
  
  // Console shows:
  // [OpenApiValidator] Failed to resolve $ref: ... - using fallback
});
```

#### Warn-Only Mode for CI

```typescript
import { test } from '@playwright/test';
import { expectApiResponse } from 'playwright-forge';

test('API validation in CI - never fail', async ({ request }) => {
  const response = await request.get('/api/users');
  
  const result = await expectApiResponse(response).toMatchOpenApiSchema({
    spec: './evolving-api.yaml',
    warnOnly: true,  // Never fail the test
    debugResolution: true
  });
  
  // Test always passes
  expect(result.valid).toBe(true);
  
  // But validation errors are logged as warnings
  if (result.warnOnlyMode && result.warnings) {
    console.log('⚠️  OpenAPI validation issues (not blocking):');
    result.warnings.forEach(w => console.log(`   ${w}`));
  }
});
```

### Configuration Patterns

#### Production Configuration

```typescript
// config/openapi.ts
export const productionConfig = {
  failOnMissingSchema: true,
  fallbackMode: 'none' as const,
  allowBrokenRefs: false,
  allowUnknownResponses: false,
  warnOnly: false,
  strict: true
};
```

#### Development Configuration

```typescript
// config/openapi.ts
export const developmentConfig = {
  failOnMissingSchema: false,
  fallbackMode: 'loose' as const,
  allowBrokenRefs: true,
  allowUnknownResponses: true,
  warnOnly: false,
  debugResolution: true
};
```

#### CI Configuration (Gradual Adoption)

```typescript
// config/openapi.ts
export const ciConfig = {
  failOnMissingSchema: false,
  fallbackMode: 'warn' as const,
  allowBrokenRefs: true,
  allowUnknownResponses: true,
  warnOnly: true,  // Collect data without blocking
  debugResolution: false
};
```

### Usage in Tests

```typescript
import { test } from '@playwright/test';
import { expectApiResponse } from 'playwright-forge';
import { productionConfig, developmentConfig } from './config/openapi';

const config = process.env.NODE_ENV === 'production' 
  ? productionConfig 
  : developmentConfig;

test('Validate API response with environment config', async ({ request }) => {
  const response = await request.get('/api/users');
  
  const result = await expectApiResponse(response).toMatchOpenApiSchema({
    spec: './openapi.yaml',
    ...config
  });
  
  expect(result.valid).toBe(true);
});
```


## Human-Readable Error Formatting

The OpenAPI validator includes a sophisticated error formatter that produces clear, actionable validation errors.

### Basic Usage with Default Formatter

```typescript
import { test } from '@playwright/test';
import { validateResponse } from 'playwright-forge';

test('API validation with formatted errors', async ({ request }) => {
  const response = await request.post('/api/users', {
    data: {
      email: 'invalid-email',  // Invalid format
      age: 'twenty-five'        // Wrong type
    }
  });
  
  const result = await validateResponse({
    spec: './openapi.yaml',
    path: '/users',
    method: 'post',
    status: 400,
    responseBody: await response.json()
  });
  
  if (!result.valid) {
    // formattedError contains human-readable output
    console.error(result.formattedError);
  }
});
```

### Example Output (Detailed Mode)

When validation fails, you'll see clear, structured output:

```
═══════════════════════════════════════════════════════════
  OpenAPI Validation Failed
═══════════════════════════════════════════════════════════

Request Context:
  Method:       POST
  Path:         /users
  URL:          https://api.example.com/users
  Status:       400
  Content-Type: application/json

Validation Summary:
  Total Errors: 3
  Mode:         strict

Validation Errors:

  Error 1:
    Field:       $.user.email
    Expected:    format: email
    Actual:      value: "invalid-email"
    Explanation: String must be valid email format

  Error 2:
    Field:       $.user.age
    Expected:    type: number
    Actual:      type: string
    Explanation: Expected number but got string

  Error 3:
    Field:       $.user
    Expected:    required property: name
    Actual:      missing
    Explanation: Missing required property "name"

Schema Context:

  {
    "type": "object",
    "properties": {
      "user": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "email": { "type": "string", "format": "email" },
          "age": { "type": "number" }
        },
        "required": ["name", "email"]
      }
    }
  }

═══════════════════════════════════════════════════════════
```

### Custom Error Formatter Configuration

```typescript
import { validateResponse } from 'playwright-forge';

const result = await validateResponse({
  spec: './openapi.yaml',
  path: '/users',
  method: 'post',
  status: 400,
  responseBody: await response.json(),
  
  // Configure error formatter
  errorFormatterConfig: {
    errorFormat: 'short',          // 'short' | 'detailed'
    maxErrors: 5,                  // Limit displayed errors
    redactFields: ['password', 'token', 'apiKey'],  // Sensitive fields
    showSchemaSnippet: false,      // Hide schema in output
    debugRawErrors: true           // Include raw AJV errors
  }
});
```

### Short Format Example

```typescript
const result = await validateResponse({
  spec: './openapi.yaml',
  path: '/users/{id}',
  method: 'get',
  status: 200,
  responseBody: data,
  errorFormatterConfig: {
    errorFormat: 'short',
    showSchemaSnippet: false
  }
});
```

Output:
```
═══════════════════════════════════════════════════════════
  OpenAPI Validation Failed
═══════════════════════════════════════════════════════════

Request Context:
  Method:       GET
  Path:         /users/{id}
  Status:       200

Validation Summary:
  Total Errors: 2
  Mode:         hybrid

Validation Errors:

  1. $.user.email: String must be valid email format
  2. $.user.age: Expected number but got string

═══════════════════════════════════════════════════════════
```

### Redacting Sensitive Fields

```typescript
import { validateResponse } from 'playwright-forge';

const result = await validateResponse({
  spec: './openapi.yaml',
  path: '/auth/login',
  method: 'post',
  status: 400,
  responseBody: {
    username: 'john',
    password: 'short'  // This will be redacted in error output
  },
  errorFormatterConfig: {
    redactFields: ['password', 'token', 'secret', 'apiKey']
  }
});

// In error output, password field will show [REDACTED]
```

### Using with OpenAPI Matcher

```typescript
import { expectApiResponse } from 'playwright-forge';

const result = await expectApiResponse(response).toMatchOpenApiSchema({
  spec: './openapi.yaml',
  
  // Configure error formatting
  errorFormatterConfig: {
    errorFormat: 'detailed',
    maxErrors: 10,
    redactFields: ['password', 'token'],
    showSchemaSnippet: true
  }
});

if (!result.valid) {
  // Access formatted error
  console.error(result.formattedError);
}
```

### Debug Mode for Troubleshooting

```typescript
const result = await validateResponse({
  spec: './openapi.yaml',
  path: '/users',
  method: 'post',
  status: 201,
  responseBody: data,
  errorFormatterConfig: {
    debugRawErrors: true  // Include raw AJV error objects
  }
});

// Output includes raw AJV errors for deep debugging:
// Raw AJV Errors (debug):
// [
//   {
//     "keyword": "type",
//     "instancePath": "/user/age",
//     "schemaPath": "#/properties/user/properties/age/type",
//     "params": { "type": "number" },
//     "message": "must be number"
//   }
// ]
```

### Production vs Development Configuration

```typescript
// config/error-formatter.ts
export const productionErrorConfig = {
  errorFormat: 'short' as const,
  maxErrors: 3,
  redactFields: ['password', 'token', 'apiKey', 'secret'],
  showSchemaSnippet: false,
  debugRawErrors: false
};

export const developmentErrorConfig = {
  errorFormat: 'detailed' as const,
  maxErrors: 20,
  redactFields: [],
  showSchemaSnippet: true,
  debugRawErrors: true
};

// In tests
const errorConfig = process.env.NODE_ENV === 'production'
  ? productionErrorConfig
  : developmentErrorConfig;

const result = await validateResponse({
  spec: './openapi.yaml',
  path: '/users',
  method: 'get',
  status: 200,
  responseBody: data,
  errorFormatterConfig: errorConfig
});
```

### Standalone Error Formatter

You can also use the error formatter independently:

```typescript
import { OpenApiErrorFormatter } from 'playwright-forge';
import { ErrorObject } from 'ajv';

const formatter = new OpenApiErrorFormatter({
  errorFormat: 'detailed',
  maxErrors: 10,
  redactFields: ['password'],
  showSchemaSnippet: true
});

const ajvErrors: ErrorObject[] = [
  // ... your AJV errors
];

const context = {
  method: 'POST',
  resolvedPath: '/users',
  actualUrl: 'https://api.example.com/users',
  status: 400,
  contentType: 'application/json',
  validationMode: 'strict' as const,
  schema: { /* schema object */ }
};

const formattedMessage = formatter.format(ajvErrors, context);
console.error(formattedMessage);
```

This provides maximum flexibility for custom validation scenarios or integration with other validation tools.
