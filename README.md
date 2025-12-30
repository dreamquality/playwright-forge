# playwright-forge

[![CI](https://github.com/dreamquality/playwright-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/dreamquality/playwright-forge/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/playwright-forge.svg)](https://www.npmjs.com/package/playwright-forge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Reusable fixtures and helpers to speed up Playwright UI and API tests.

## Features

🚀 **Production-Ready** - Battle-tested fixtures and utilities for Playwright Test  
⚡ **Parallel-Safe** - All fixtures designed for parallel execution  
🔧 **TypeScript First** - Full TypeScript support with type definitions  
📦 **Zero Config** - No hardcoded environments or timeouts  
🎯 **Modular** - Use only what you need via barrel exports

## Installation

```bash
npm install playwright-forge
# or
yarn add playwright-forge
```

Peer dependency: `@playwright/test` ^1.40.0

## Fixtures

### API Fixture
Provides a configured API request context with automatic lifecycle management.

```typescript
import { apiFixture } from 'playwright-forge';

apiFixture('API test', async ({ api }) => {
  const response = await api.get('https://api.example.com/users');
  expect(response.ok()).toBeTruthy();
});
```

### Auth Fixture
Manages authentication state with `storageState` for session persistence.

```typescript
import { authFixture, saveAuthState, loadAuthState } from 'playwright-forge';

authFixture('Auth test', async ({ context, auth }) => {
  // Login logic here
  await saveAuthState(context, auth.storageStatePath);
  
  // Load in another test
  const state = await loadAuthState(auth.storageStatePath);
});
```

### Network Fixture
Utilities for waiting and intercepting network requests.

```typescript
import { networkFixture } from 'playwright-forge';

networkFixture('Network test', async ({ page, network }) => {
  // Wait for specific response
  await network.waitForResponse(/api\/users/);
  
  // Intercept requests
  await network.interceptRequest('**/*.css', (route) => {
    route.abort();
  });
  
  // Clear all interceptions
  await network.clearInterceptions();
});
```

### Cleanup Fixture
Manages teardown tasks ensuring proper cleanup even if tests fail.

```typescript
import { cleanupFixture } from 'playwright-forge';

cleanupFixture('Cleanup test', async ({ cleanup }) => {
  const tempFile = 'temp.txt';
  
  cleanup.addTask(async () => {
    // Cleanup code - runs in reverse order (LIFO)
    await fs.unlink(tempFile);
  });
});
```

### Diagnostics Fixture
Automatically captures screenshots on test failure.

```typescript
import { diagnosticsFixture } from 'playwright-forge';

diagnosticsFixture('Diagnostics test', async ({ page, diagnostics }) => {
  await page.goto('https://example.com');
  
  // Manual screenshot
  await diagnostics.captureScreenshot('custom-name');
  
  // Automatic screenshot on failure
});
```

## Utilities

### OpenAPI Schema Validation (One-Liner API)
Validate API responses with automatic method/path/status detection.

```typescript
import { expectApiResponse } from 'playwright-forge';

// One-liner - auto-detects method, path, status from response!
const result = await expectApiResponse(response).toMatchOpenApiSchema({
  spec: 'https://api.example.com/openapi.yaml'
});

// With optional overrides
const result = await expectApiResponse(response).toMatchOpenApiSchema({
  spec: './openapi.json',
  method: 'get',      // Optional: override auto-detected method
  path: '/users/123', // Optional: override auto-detected path
  status: 200,        // Optional: override auto-detected status
  strict: true,       // Optional: reject additional properties
  enableCache: true,  // Optional: cache OpenAPI spec (default: true)
  cacheTTL: 60000,    // Optional: cache duration in ms
  debug: true         // Optional: enable debug logging
});
```

**Advanced Usage:**
```typescript
import { OpenApiMatcher } from 'playwright-forge';

// Create matcher with custom configuration
const matcher = new OpenApiMatcher({
  strict: true,
  enableCache: true,
  cacheTTL: 300000,  // 5 minutes
  debug: true,
  pathResolver: (templatePath, actualPath) => {
    // Custom path matching logic
    return templatePath.toLowerCase() === actualPath.toLowerCase();
  },
  errorFormatter: (errors, context) => {
    return `Custom error for ${context.method} ${context.path}`;
  }
});

// Validate with full control
const result = await matcher.validateResponse(response, spec, {
  method: 'post',
  path: '/users',
  status: 201
});
```

**Features:**
- ⚡ **One-liner API** - Auto-detects method, path, and status from Playwright response
- 📥 **Flexible spec loading** - URL, local file (.yaml/.yml/.json), or JS object
- 🔗 **Automatic $ref resolution** - Handles internal references
- 🎯 **Smart path matching** - Matches `/users/123` to `/users/{id}` automatically
- 💾 **Per-worker caching** - Parallel-safe in-memory cache with optional TTL
- ⚙️ **Highly configurable** - Custom path resolvers, error formatters, AJV options
- 📊 **Detailed errors** - Clear validation messages with schema context
- 🛡️ **Framework-agnostic** - Works with any HTTP client, optimized for Playwright

**Cache Management:**
```typescript
import { OpenApiMatcher } from 'playwright-forge';

// Check cache size
OpenApiMatcher.getCacheSize();

// Clear entire cache
OpenApiMatcher.clearCache();

// Clear specific spec
OpenApiMatcher.clearCache('https://api.example.com/openapi.yaml');
```

### Legacy OpenAPI Validation
For manual validation without auto-detection:

```typescript
import { validateResponse, assertValidResponse } from 'playwright-forge';

// Manual validation
const result = await validateResponse({
  spec: 'https://api.example.com/openapi.yaml',
  path: '/users/{id}',
  method: 'get',
  status: 200,
  responseBody: await response.json()
});

// Or assert (throws on failure)
await assertValidResponse({
  spec: './openapi.json',
  path: '/users/{id}',
  method: 'get',
  status: 200,
  responseBody: await response.json(),
  strict: true
});
```

### JSON Schema Validation
Validate JSON data against schemas using AJV.

```typescript
import { validateJsonSchema, assertJsonSchema } from 'playwright-forge';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' }
  },
  required: ['name', 'age']
};

// Validation with result
const result = validateJsonSchema(data, schema);
if (!result.valid) {
  console.log(result.errors);
}

// Assert and throw on failure
assertJsonSchema(data, schema);
```

### YAML Loader
Load and parse YAML files synchronously or asynchronously.

```typescript
import { loadYaml, loadYamlAsync, saveYaml } from 'playwright-forge';

const config = loadYaml<Config>('config.yml');
const asyncConfig = await loadYamlAsync<Config>('config.yml');

saveYaml('output.yml', data);
```

### Download Helper
Wait for and manage file downloads.

```typescript
import { waitForDownload } from 'playwright-forge';

const filePath = await waitForDownload(
  page,
  async () => await page.click('#download-button'),
  { targetPath: './downloads/file.pdf' }
);
```

### Polling Utilities
Poll conditions or values with configurable intervals and timeouts.

```typescript
import { poll, pollUntilValue } from 'playwright-forge';

// Poll until condition is true
await poll(
  async () => await element.isVisible(),
  { interval: 100, timeout: 5000 }
);

// Poll until value is returned
const result = await pollUntilValue(
  async () => await fetchData(),
  { interval: 500, timeout: 10000 }
);
```

### Data Factory
Generate random test data using Faker.

```typescript
import { DataFactory, faker } from 'playwright-forge';

const user = DataFactory.user();
const product = DataFactory.product();
const company = DataFactory.company();
const address = DataFactory.address();

// Generate arrays
const users = DataFactory.array(() => DataFactory.user(), 10);

// Seed for reproducibility
DataFactory.seed(12345);

// Use faker directly for custom data
const customEmail = faker.internet.email();
```

### Soft Assertions
Collect multiple assertion failures and report them together.

```typescript
import { softAssertions } from 'playwright-forge';

const soft = softAssertions();

await soft.assert(() => expect(value1).toBe(expected1));
await soft.assert(() => expect(value2).toBe(expected2));
await soft.assert(() => expect(value3).toBe(expected3));

// Throws error with all failures
soft.verify();
```

### Page Guard
Verify and wait for page states before interactions.

```typescript
import { createPageGuard } from 'playwright-forge';

const guard = createPageGuard(page);

// Wait for page to be ready
await guard.waitForReady();

// Wait for URL pattern
await guard.waitForUrl(/dashboard/);

// Guard element before interaction
const button = await guard.guardElement('#submit-button');
await button.click();

// Wait for stable element (not animating)
await guard.waitForStable('.animated-modal');

// Verify page state
await guard.verify({
  urlPattern: /dashboard/,
  titlePattern: /Admin Dashboard/
});
```

### File Assertions
Assert file existence, content, and properties.

```typescript
import { FileAssertions } from 'playwright-forge';

FileAssertions.exists('path/to/file.txt');
FileAssertions.notExists('path/to/nonexistent.txt');
FileAssertions.contentEquals('file.txt', 'expected content');
FileAssertions.contentContains('file.txt', 'substring');
FileAssertions.contentMatches('file.txt', /pattern/);
FileAssertions.sizeEquals('file.txt', 1024);
FileAssertions.sizeGreaterThan('file.txt', 500);
FileAssertions.isEmpty('file.txt');
FileAssertions.isNotEmpty('file.txt');
```

## Combining Fixtures

You can combine multiple fixtures in your tests:

```typescript
import { apiFixture, cleanupFixture, diagnosticsFixture } from 'playwright-forge';

const test = apiFixture
  .extend(cleanupFixture.fixtures)
  .extend(diagnosticsFixture.fixtures);

test('Combined test', async ({ api, cleanup, diagnostics }) => {
  // Use all fixtures together
});
```

## Configuration

All fixtures and utilities are designed to be configuration-free with sensible defaults:
- **No hardcoded environment variables** - Configure via Playwright config or test.use()
- **No hardcoded timeouts** - Pass timeouts as options where needed
- **Parallel-safe** - Each test gets isolated fixture instances

## Example: Complete Test Suite

```typescript
import { test as base } from '@playwright/test';
import {
  apiFixture,
  cleanupFixture,
  diagnosticsFixture,
  DataFactory,
  validateJsonSchema,
  softAssertions
} from 'playwright-forge';

const test = apiFixture
  .extend(cleanupFixture.fixtures)
  .extend(diagnosticsFixture.fixtures);

test('Complete example', async ({ api, cleanup, diagnostics, page }) => {
  // Generate test data
  const testUser = DataFactory.user();
  
  // Make API call
  const response = await api.post('/api/users', { data: testUser });
  const userData = await response.json();
  
  // Validate response
  const userSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      email: { type: 'string' }
    },
    required: ['id', 'email']
  };
  validateJsonSchema(userData, userSchema);
  
  // Soft assertions
  const soft = softAssertions();
  await soft.assert(() => expect(userData.email).toBe(testUser.email));
  await soft.assert(() => expect(userData.firstName).toBe(testUser.firstName));
  soft.verify();
  
  // UI interaction
  await page.goto('/users');
  await diagnostics.captureScreenshot('users-page');
  
  // Register cleanup
  cleanup.addTask(async () => {
    await api.delete(`/api/users/${userData.id}`);
  });
});
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## CI/CD

This package uses GitHub Actions for continuous integration and deployment:

- **CI Workflow** - Automatically runs tests, linting, and builds on every push and PR
  - Tests on Node.js 18.x and 20.x
  - Runs security audit
  - Uploads test results and coverage

- **Publish Workflow** - Automatically publishes to npm when a GitHub release is created
  - Verifies version matches release tag
  - Runs all tests before publishing
  - Publishes to npm with public access

See [.github/workflows/README.md](.github/workflows/README.md) for detailed documentation.

## License

MIT

