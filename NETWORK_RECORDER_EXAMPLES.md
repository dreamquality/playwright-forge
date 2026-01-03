# Network Recorder and Mock Server Examples

This document provides practical examples of using the Network Recorder and Mock Server features in playwright-forge.

## Basic Recording

Record network traffic during a test:

```typescript
import { test } from '@playwright/test';
import { networkRecorderFixture } from 'playwright-forge';

networkRecorderFixture('Record API calls', async ({ page, networkRecorder }) => {
  // Start recording
  await networkRecorder.startRecording();
  
  // Navigate and interact with the page
  await page.goto('https://myapp.com');
  await page.click('#fetch-data');
  
  // Stop recording and get entries
  const recordings = networkRecorder.stopRecording();
  console.log(`Recorded ${recordings.length} requests`);
  
  // Save to file
  await networkRecorder.saveRecordings('api-test.json');
});
```

## Filtered Recording

Record only specific requests:

```typescript
import { test } from '@playwright/test';
import { NetworkRecorder } from 'playwright-forge';

test('Record filtered requests', async ({ page }) => {
  const recorder = new NetworkRecorder({
    filter: {
      domains: ['api.myapp.com'],
      methods: ['GET', 'POST'],
      pathPatterns: ['/api/'],
      statusCodes: [200, 201]
    }
  });
  
  await recorder.startRecording(page);
  await page.goto('https://myapp.com');
  recorder.stopRecording();
  
  await recorder.saveRecordings('filtered-recordings.json');
});
```

## Mock Server with Recorded Data

Replay recorded network traffic:

```typescript
import { test } from '@playwright/test';
import { mockServerFixture } from 'playwright-forge';

mockServerFixture('Use mocked responses', async ({ page, mockServer }) => {
  // Load previously recorded data
  mockServer.loadRecordings('api-test.json');
  
  // Start mock server
  await mockServer.start();
  
  // All matching requests will now use mocked responses
  await page.goto('https://myapp.com');
  await page.click('#fetch-data');
  
  // Verify the UI updated with mocked data
  await expect(page.locator('#result')).toContainText('Expected Data');
  
  await mockServer.stop();
});
```

## Record and Replay Pattern

A common pattern for deterministic tests:

```typescript
import { test } from '@playwright/test';
import { NetworkRecorder, MockServer } from 'playwright-forge';

test.describe('User Management', () => {
  // Step 1: Record actual API interactions (run once)
  test.skip('Record user flow', async ({ page }) => {
    const recorder = new NetworkRecorder({
      filter: { domains: ['api.myapp.com'] }
    });
    
    await recorder.startRecording(page);
    
    // Perform the actual user flow
    await page.goto('https://myapp.com/users');
    await page.click('#add-user');
    await page.fill('#name', 'John Doe');
    await page.click('#submit');
    
    recorder.stopRecording();
    await recorder.saveRecordings('user-management-flow.json');
  });
  
  // Step 2: Use recorded data for fast, deterministic tests
  test('Create user with mocked API', async ({ page }) => {
    const mockServer = new MockServer();
    mockServer.loadRecordings('user-management-flow.json');
    
    await mockServer.start(page);
    
    // Same flow, but with mocked responses
    await page.goto('https://myapp.com/users');
    await page.click('#add-user');
    await page.fill('#name', 'John Doe');
    await page.click('#submit');
    
    // Verify UI behavior
    await expect(page.locator('.success-message')).toBeVisible();
    
    await mockServer.stop(page);
  });
});
```

## Custom Mock Data

Create mock responses programmatically:

```typescript
import { test } from '@playwright/test';
import { mockServerFixture, RecordedEntry } from 'playwright-forge';

mockServerFixture('Custom mock data', async ({ page, mockServer }) => {
  // Define custom mock responses
  const customMocks: RecordedEntry[] = [
    {
      request: {
        url: 'https://api.myapp.com/users',
        method: 'GET',
        headers: {},
        postData: null,
        timestamp: Date.now()
      },
      response: {
        url: 'https://api.myapp.com/users',
        method: 'GET',
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([
          { id: 1, name: 'Test User 1' },
          { id: 2, name: 'Test User 2' }
        ]),
        timing: {
          startTime: Date.now(),
          endTime: Date.now() + 50,
          duration: 50
        }
      }
    }
  ];
  
  mockServer.setRecordings(customMocks);
  await mockServer.start();
  
  await page.goto('https://myapp.com/users');
  // Page will receive the custom mock data
  
  await mockServer.stop();
});
```

## Environment Variables

Control behavior via environment variables:

```bash
# Disable recording in CI
NETWORK_RECORDER_ENABLED=false npm test

# Change output directory
NETWORK_RECORDER_OUTPUT_DIR=./test-artifacts/recordings npm test

# Enable mock server with delay
MOCK_SERVER_ENABLED=true MOCK_SERVER_DELAY=100 npm test
```

In your test:
```typescript
import { NetworkRecorder } from 'playwright-forge';

test('Respects environment variables', async ({ page }) => {
  // Will use env vars if set, otherwise defaults
  const recorder = new NetworkRecorder();
  
  await recorder.startRecording(page);
  // ... test code ...
});
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests with mocked network
        run: npm test
        env:
          MOCK_SERVER_ENABLED: true
          MOCK_SERVER_RECORDINGS_DIR: ./fixtures/recordings
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results/
```

## Advanced: Dynamic Field Handling

Handle dynamic values like IDs and timestamps:

```typescript
import { MockServer } from 'playwright-forge';

const mockServer = new MockServer({
  dynamicFields: [
    { path: 'data.id', matcher: 'uuid' },
    { path: 'data.createdAt', matcher: 'timestamp' },
    { path: 'data.version', matcher: 'number' },
    { 
      path: 'data.status', 
      matcher: (value) => ['active', 'inactive'].includes(value) 
    }
  ]
});

// When matching requests, these fields will be treated as wildcards
```

## Performance Testing

Add artificial delays to simulate network conditions:

```typescript
import { MockServer } from 'playwright-forge';

test('Test with slow network', async ({ page }) => {
  const mockServer = new MockServer({
    delay: 500 // 500ms delay for all responses
  });
  
  mockServer.loadRecordings('test-data.json');
  await mockServer.start(page);
  
  await page.goto('https://myapp.com');
  
  // Test how the app handles slow responses
  await expect(page.locator('.loading-spinner')).toBeVisible();
  await expect(page.locator('.content')).toBeVisible({ timeout: 10000 });
  
  await mockServer.stop(page);
});
```

## Best Practices

1. **Keep recordings small**: Use filters to record only what you need
2. **Version control recordings**: Check recording files into version control for reproducible tests
3. **Update recordings periodically**: Keep them in sync with your API
4. **Use in CI/CD**: Mock server enables fast, deterministic CI/CD pipelines
5. **Combine with other fixtures**: Use with cleanup, diagnostics, etc. for comprehensive tests
6. **Test both modes**: Use real API in development, mocked in CI
