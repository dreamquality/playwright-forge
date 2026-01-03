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

### Network Recorder Fixture
Records HTTP requests and responses during test execution for analysis or replay.

```typescript
import { networkRecorderFixture } from 'playwright-forge';

networkRecorderFixture('Record API calls', async ({ page, networkRecorder }) => {
  // Start recording
  await networkRecorder.startRecording();
  
  // Perform actions that generate network traffic
  await page.goto('https://example.com');
  await page.click('#load-data');
  
  // Stop recording and get recordings
  const recordings = networkRecorder.stopRecording();
  
  // Save recordings to file
  await networkRecorder.saveRecordings('test-recordings.json');
});
```

**Features:**
- Records URL, method, status, headers, body, and timing for each request/response
- Configurable filters (by domain, method, path, status)
- Saves recordings to JSON files per test or suite
- Respects environment variables for CI/CD integration
- Automatic cleanup on test teardown

**Configuration:**
```typescript
// Via constructor (when using NetworkRecorder directly)
const recorder = new NetworkRecorder({
  enabled: true,
  outputDir: 'network-recordings',
  filter: {
    domains: ['api.example.com'],
    methods: ['GET', 'POST'],
    pathPatterns: ['/api/', /\/users\/\d+/],
    statusCodes: [200, 201]
  },
  maxBodySize: 10 * 1024 * 1024, // 10MB
  prettifyJson: true
});

// Via environment variables
// NETWORK_RECORDER_ENABLED=true
// NETWORK_RECORDER_OUTPUT_DIR=./recordings
// NETWORK_RECORDER_MAX_BODY_SIZE=5242880
```

### Mock Server Fixture
Intercepts network requests and responds with recorded data for deterministic testing.

```typescript
import { mockServerFixture } from 'playwright-forge';

mockServerFixture('Mock API responses', async ({ page, mockServer }) => {
  // Load recordings from file
  mockServer.loadRecordings('test-recordings.json');
  
  // Or set recordings manually
  mockServer.setRecordings([
    {
      request: {
        url: 'https://api.example.com/users',
        method: 'GET',
        headers: {},
        postData: null,
        timestamp: Date.now()
      },
      response: {
        url: 'https://api.example.com/users',
        method: 'GET',
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([{ id: 1, name: 'John' }]),
        timing: { startTime: Date.now(), endTime: Date.now() + 10, duration: 10 }
      }
    }
  ]);
  
  // Start mock server
  await mockServer.start();
  
  // Perform actions - network requests will be intercepted
  await page.goto('https://example.com');
  
  // Stop mock server
  await mockServer.stop();
});
```

**Features:**
- Replay mode: intercepts requests and responds from recorded data
- Flexible URL matching (strict or path-based)
- Support for dynamic fields via configurable matchers
- Configurable artificial delays to simulate network latency
- Fallback to real network if no mock data found (optional)
- CI-friendly and deterministic

**Configuration:**
```typescript
// Via constructor (when using MockServer directly)
const mockServer = new MockServer({
  enabled: true,
  recordingsDir: 'network-recordings',
  strictMatching: false, // false = match by path, true = exact URL match
  fallbackToNetwork: false, // Return 404 if no match found
  delay: 100, // Artificial delay in ms
  dynamicFields: [
    { path: 'data.id', matcher: 'uuid' },
    { path: 'timestamp', matcher: 'timestamp' },
    { path: 'data.count', matcher: 'number' }
  ]
});

// Via environment variables
// MOCK_SERVER_ENABLED=true
// MOCK_SERVER_RECORDINGS_DIR=./recordings
// MOCK_SERVER_DELAY=50
```

**Record and Replay Workflow:**
```typescript
import { test } from '@playwright/test';
import { NetworkRecorder, MockServer } from 'playwright-forge';

// Step 1: Record network traffic
test('Record session', async ({ page }) => {
  const recorder = new NetworkRecorder({
    filter: { domains: ['api.example.com'] }
  });
  
  await recorder.startRecording(page);
  await page.goto('https://example.com');
  // ... perform actions ...
  recorder.stopRecording();
  
  await recorder.saveRecordings('my-test.json');
});

// Step 2: Replay with mocked responses
test('Replay session', async ({ page }) => {
  const mockServer = new MockServer();
  mockServer.loadRecordings('my-test.json');
  
  await mockServer.start(page);
  await page.goto('https://example.com');
  // ... same actions, but with mocked responses ...
  await mockServer.stop(page);
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
Comprehensive page and component readiness checks with configurable behavior, reducing flaky tests.

**Features:**
- Wait for page readiness (document.readyState, network idle, mandatory elements)
- Wait for component readiness with custom conditions
- Automatic retry for failed actions (click, fill, select)
- Strict or tolerant mode (throw errors vs. log warnings)
- Debug logging for troubleshooting

```typescript
import { createPageGuard, type PageGuardConfig } from 'playwright-forge';

// Basic usage with defaults
const guard = createPageGuard(page);
await guard.waitForReady();

// Advanced configuration
const config: PageGuardConfig = {
  timeout: 10000,              // Timeout in ms (default: 30000)
  interval: 100,               // Polling interval in ms (default: 100)
  mode: 'strict',              // 'strict' throws errors, 'tolerant' logs warnings
  debug: true,                 // Enable debug logging
  waitForNetworkIdle: true,    // Wait for network idle (default: false)
  retryCount: 3,               // Retry count for actions (default: 3)
  retryInterval: 1000,         // Retry interval in ms (default: 1000)
  mandatorySelectors: [        // Required elements
    '#header',
    '#main-content'
  ],
  ignoredSelectors: ['#ad']    // Elements to skip
};

const guard = createPageGuard(page, config);

// Wait for page to be fully ready
await guard.waitForReady();

// Wait for component with custom conditions
await guard.waitForComponent([
  { selector: '#modal', state: 'visible' },
  { selector: '.spinner', state: 'hidden' },
  { 
    selector: '#status', 
    state: 'visible',
    attribute: 'data-loaded', 
    attributeValue: 'true' 
  },
  {
    selector: '#indicator',
    state: 'visible',
    attribute: 'data-status',
    attributeValue: /ready|complete/  // Supports regex
  }
]);

// Actions with automatic retry
await guard.click('#submit-button');
await guard.fill('#username', 'user@example.com');
await guard.selectOption('#country', 'US');

// Retry custom actions
const data = await guard.retryAction(async () => {
  const response = await page.request.get('/api/data');
  if (!response.ok()) throw new Error('API call failed');
  return response.json();
}, 'fetch data');

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

// Tolerant mode - collect warnings instead of failing
const tolerantGuard = createPageGuard(page, { mode: 'tolerant' });
await tolerantGuard.waitForReady();
const warnings = tolerantGuard.getWarnings();
if (warnings.length > 0) {
  console.log('Warnings:', warnings);
}
tolerantGuard.clearWarnings();
```

**Example: Real-world SPA scenario**
```typescript
const guard = createPageGuard(page, {
  debug: true,
  waitForNetworkIdle: true,
  mandatorySelectors: ['#app', '#navigation'],
  retryCount: 3
});

// Navigate and wait for SPA to initialize
await page.goto('https://app.example.com');
await guard.waitForReady();

// Wait for framework initialization
await guard.waitForComponent([
  { selector: '#app', attribute: 'data-initialized', attributeValue: 'true' },
  { selector: '.loading-overlay', state: 'hidden' }
]);

// Safe to interact
await guard.click('#dashboard-link');
await guard.waitForUrl(/\/dashboard/);
```

### Stable Action Helpers
Framework-agnostic utilities for reliable Playwright actions with automatic retries, waits, and element stability checks.

**Features:**
- Automatic wait for element visibility, enabled state, and stability
- Built-in retry logic for transient failures
- Element stability detection (not animating)
- Configurable timeouts, retry intervals, and scroll behavior
- Strict or tolerant error handling modes
- Debug logging for troubleshooting

```typescript
import { stableClick, stableFill, stableSelect, type StableActionConfig } from 'playwright-forge';

// Basic usage - click with automatic retries
await stableClick(page, '#submit-button');

// Fill input with value verification
await stableFill(page, '#email', 'user@example.com');

// Select option with retry on DOM updates
await stableSelect(page, '#country', 'US');

// Advanced configuration
const baseConfig: StableActionConfig = {
  timeout: 10000,              // Timeout in ms (default: 30000)
  retryInterval: 100,          // Retry interval in ms (default: 100)
  maxRetries: 5,               // Maximum retries (default: 3)
  scrollBehavior: 'center',    // Scroll behavior: 'auto' | 'center' | 'nearest' (reserved for future use)
  debug: true,                 // Enable debug logging (default: false)
  mode: 'strict',              // 'strict' throws errors immediately, 'tolerant' logs warnings and returns without throwing
};

// Click-specific configuration (stability options apply only to stableClick)
const clickConfig: StableActionConfig = {
  ...baseConfig,
  stabilityThreshold: 3,        // Consecutive stable checks required (default: 3)
  stabilityCheckInterval: 100   // Interval between stability checks (default: 100)
};

await stableClick(page, '#dynamic-button', clickConfig);
await stableFill(page, '#search', 'query', baseConfig);
await stableSelect(page, '#dropdown', 'option-1', baseConfig);
```

**Stable Click:**
- Waits for element to be visible, enabled, and stable
- Automatically scrolls element into view
- Retries if element detaches or click fails
- Uses Playwright's built-in actionability checks

**Stable Fill:**
- Waits for input/textarea to be visible and enabled
- Clears existing value safely
- Retries until value is properly set
- Verifies the value was set correctly

**Stable Select:**
- Waits for select element and options to be loaded
- Handles dynamic option loading
- Retries selection if DOM updates
- Verifies selection was successful (all values for multi-select)

**Example: Form interaction with retries**
```typescript
// Configure for flaky environments
const config = { 
  maxRetries: 5, 
  timeout: 10000
};

// Fill form with automatic retries
await stableFill(page, '#username', 'john.doe', config);
// Avoid enabling debug when filling sensitive fields like passwords
await stableFill(page, '#password', 'secret123', config);
await stableSelect(page, '#role', 'admin', config);
await stableClick(page, '#submit', config);
```

**Example: Chaining with Page Guards**
```typescript
import { createPageGuard, stableClick, stableFill } from 'playwright-forge';

const guard = createPageGuard(page, { debug: true });
await guard.waitForReady();

// Use stable helpers for critical actions
await stableFill(page, '#search-input', 'playwright');
await stableClick(page, '#search-button');

await guard.waitForUrl(/\/search\?q=/);
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
import { apiFixture, cleanupFixture, diagnosticsFixture, networkRecorderFixture } from 'playwright-forge';

const test = apiFixture
  .extend(cleanupFixture.fixtures)
  .extend(diagnosticsFixture.fixtures)
  .extend(networkRecorderFixture.fixtures);

test('Combined test', async ({ api, cleanup, diagnostics, networkRecorder }) => {
  // Start recording network traffic
  await networkRecorder.startRecording();
  
  // Use API fixture
  const response = await api.get('https://api.example.com/data');
  
  // Register cleanup
  cleanup.addTask(async () => {
    await api.delete('/cleanup');
  });
  
  // Capture diagnostics
  await diagnostics.captureScreenshot('test-state');
  
  // Save recordings
  await networkRecorder.saveRecordings();
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
  networkRecorderFixture,
  DataFactory,
  validateJsonSchema,
  softAssertions
} from 'playwright-forge';

const test = apiFixture
  .extend(cleanupFixture.fixtures)
  .extend(diagnosticsFixture.fixtures)
  .extend(networkRecorderFixture.fixtures);

test('Complete example with network recording', async ({ 
  api, 
  cleanup, 
  diagnostics, 
  page,
  networkRecorder 
}) => {
  // Start recording network traffic
  await networkRecorder.startRecording();
  
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
  
  // Stop recording and save
  networkRecorder.stopRecording();
  await networkRecorder.saveRecordings('user-creation-test.json');
  
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

