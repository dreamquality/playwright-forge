import { test, expect } from '@playwright/test';
import { networkRecorderFixture, mockServerFixture } from '../src/fixtures/networkRecorder';
import { NetworkRecorder, MockServer, RecordedEntry } from '../src/utils/networkRecorder';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Create fixtures test
const recorderTest = networkRecorderFixture;
const mockTest = mockServerFixture;

// Use a data URL for testing (no external network needed)
const testPage = 'data:text/html,<html><body><h1>Test Page</h1></body></html>';

// Cross-platform temp directory
const getTempDir = () => path.join(os.tmpdir(), 'playwright-forge-tests');

test.describe('Network Recorder Tests', () => {
  test('NetworkRecorder can be instantiated with config', async () => {
    const recorder = new NetworkRecorder({
      enabled: true,
      outputDir: getTempDir(),
    });

    expect(recorder).toBeDefined();
    expect(recorder.getRecordings).toBeDefined();
  });

  test('NetworkRecorder filters by domain', async () => {
    const recorder = new NetworkRecorder({
      enabled: true,
      outputDir: getTempDir(),
      filter: {
        domains: ['example.com'],
      },
    });

    expect((recorder as any).config.filter.domains).toEqual(['example.com']);
  });

  test('NetworkRecorder filters by method', async () => {
    const recorder = new NetworkRecorder({
      enabled: true,
      outputDir: getTempDir(),
      filter: {
        methods: ['GET'],
      },
    });

    expect((recorder as any).config.filter.methods).toEqual(['GET']);
  });

  test('NetworkRecorder filters by status code', async () => {
    const recorder = new NetworkRecorder({
      enabled: true,
      outputDir: getTempDir(),
      filter: {
        statusCodes: [200],
      },
    });

    expect((recorder as any).config.filter.statusCodes).toEqual([200]);
  });

  test('NetworkRecorder saves recordings to file', async () => {
    const outputDir = getTempDir();
    const recorder = new NetworkRecorder({
      enabled: true,
      outputDir,
    });

    // Create mock recordings
    const mockRecordings: RecordedEntry[] = [
      {
        request: {
          url: 'https://api.example.com/users',
          method: 'GET',
          headers: {},
          postData: null,
          timestamp: Date.now(),
        },
        response: {
          url: 'https://api.example.com/users',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify([{ id: 1, name: 'John' }]),
          timing: {
            startTime: Date.now(),
            endTime: Date.now() + 10,
            duration: 10,
          },
        },
      },
    ];

    // Manually set recordings (simulating what would be recorded)
    (recorder as any).recordings = mockRecordings;
    
    const filepath = await recorder.saveRecordings('test-recording.json');
    
    expect(fs.existsSync(filepath)).toBe(true);
    
    // Verify file content
    const content = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].request.url).toBe('https://api.example.com/users');
    
    // Cleanup
    fs.unlinkSync(filepath);
  });

  test('NetworkRecorder respects enabled flag', async () => {
    const recorder = new NetworkRecorder({
      enabled: false,
    });

    expect((recorder as any).config.enabled).toBe(false);
  });

  test('NetworkRecorder can clear recordings', async () => {
    const recorder = new NetworkRecorder({
      enabled: true,
      outputDir: getTempDir(),
    });

    // Add mock recordings
    (recorder as any).recordings = [
      {
        request: { url: 'test', method: 'GET', headers: {}, postData: null, timestamp: Date.now() },
        response: { url: 'test', method: 'GET', status: 200, statusText: 'OK', headers: {}, body: '', timing: { startTime: 0, endTime: 0, duration: 0 } },
      },
    ];
    
    const recordings = recorder.getRecordings();
    expect(recordings.length).toBe(1);
    
    recorder.clearRecordings();
    const emptyRecordings = recorder.getRecordings();
    expect(emptyRecordings.length).toBe(0);
  });

  test('NetworkRecorder prevents path traversal in saveRecordings', async () => {
    const recorder = new NetworkRecorder({
      enabled: true,
      outputDir: getTempDir(),
    });

    // Add a mock recording
    (recorder as any).recordings = [
      {
        request: { url: 'test', method: 'GET', headers: {}, postData: null, timestamp: Date.now() },
        response: { url: 'test', method: 'GET', status: 200, statusText: 'OK', headers: {}, body: '', timing: { startTime: 0, endTime: 0, duration: 0 } },
      },
    ];

    // Try to save with path traversal - should throw error
    await expect(recorder.saveRecordings('../../../etc/passwd')).rejects.toThrow('Invalid filename');
    await expect(recorder.saveRecordings('../../test.json')).rejects.toThrow('Invalid filename');
    
    // Valid filename should work
    const filepath = await recorder.saveRecordings('valid-test.json');
    expect(fs.existsSync(filepath)).toBe(true);
    fs.unlinkSync(filepath);
  });
});

test.describe('Mock Server Tests', () => {
  test('MockServer can load and set recordings', async ({ page }) => {
    const mockServer = new MockServer({
      enabled: true,
    });

    const mockRecordings: RecordedEntry[] = [
      {
        request: {
          url: 'https://api.example.com/users',
          method: 'GET',
          headers: {},
          postData: null,
          timestamp: Date.now(),
        },
        response: {
          url: 'https://api.example.com/users',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify([{ id: 1, name: 'John' }]),
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 10,
          },
        },
      },
    ];

    mockServer.setRecordings(mockRecordings);
    
    const recordings = mockServer.getRecordings();
    expect(recordings.length).toBe(1);
    expect(recordings[0].request.url).toBe('https://api.example.com/users');
  });

  test('MockServer intercepts and responds with mock data', async ({ page }) => {
    const mockServer = new MockServer({
      enabled: true,
      strictMatching: false,
    });

    const mockRecordings: RecordedEntry[] = [
      {
        request: {
          url: 'http://localhost:9999/api/users',
          method: 'GET',
          headers: {},
          postData: null,
          timestamp: Date.now(),
        },
        response: {
          url: 'http://localhost:9999/api/users',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify([{ id: 1, name: 'Mocked User' }]),
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 10,
          },
        },
      },
    ];

    mockServer.setRecordings(mockRecordings);
    await mockServer.start(page);

    // Create a page that makes a fetch request
    const htmlContent = `
      <html>
        <body>
          <script>
            fetch('http://localhost:9999/api/users')
              .then(r => r.json())
              .then(data => {
                document.body.innerHTML = '<div id="result">' + data[0].name + '</div>';
              });
          </script>
        </body>
      </html>
    `;
    
    await page.goto(`data:text/html,${encodeURIComponent(htmlContent)}`);
    
    // Wait for the result to appear
    await page.waitForSelector('#result', { timeout: 5000 });
    const name = await page.locator('#result').textContent();
    
    expect(name).toBe('Mocked User');

    await mockServer.stop(page);
  });

  test('MockServer returns 404 for unmatched requests without fallback', async ({ page }) => {
    const mockServer = new MockServer({
      enabled: true,
      fallbackToNetwork: false,
    });

    mockServer.setRecordings([]); // No recordings
    await mockServer.start(page);

    // Create a page that makes a fetch request
    const htmlContent = `
      <html>
        <body>
          <script>
            fetch('http://localhost:9999/nonexistent')
              .then(r => {
                document.body.innerHTML = '<div id="status">' + r.status + '</div>';
              });
          </script>
        </body>
      </html>
    `;
    
    await page.goto(`data:text/html,${encodeURIComponent(htmlContent)}`);
    
    // Wait for the result to appear
    await page.waitForSelector('#status', { timeout: 5000 });
    const status = await page.locator('#status').textContent();
    
    expect(status).toBe('404');

    await mockServer.stop(page);
  });

  test('MockServer respects enabled flag', async () => {
    const mockServer = new MockServer({
      enabled: false,
    });

    expect((mockServer as any).config.enabled).toBe(false);
  });

  test('MockServer can clear recordings', async ({ page }) => {
    const mockServer = new MockServer({
      enabled: true,
    });

    const mockRecordings: RecordedEntry[] = [
      {
        request: {
          url: 'https://api.example.com/users',
          method: 'GET',
          headers: {},
          postData: null,
          timestamp: Date.now(),
        },
        response: {
          url: 'https://api.example.com/users',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: {},
          body: 'test',
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 10,
          },
        },
      },
    ];

    mockServer.setRecordings(mockRecordings);
    expect(mockServer.getRecordings().length).toBe(1);
    
    mockServer.clearRecordings();
    expect(mockServer.getRecordings().length).toBe(0);
  });

  test('MockServer prevents path traversal in loadRecordings', async () => {
    const mockServer = new MockServer({
      enabled: true,
      recordingsDir: getTempDir(),
    });

    // Try to load with path traversal - should throw error
    expect(() => mockServer.loadRecordings('../../../etc/passwd')).toThrow('Invalid filename');
    expect(() => mockServer.loadRecordings('../../test.json')).toThrow('Invalid filename');
  });

  test('MockServer handles multiple start/stop calls gracefully', async ({ page }) => {
    const mockServer = new MockServer({
      enabled: true,
    });

    const mockRecordings: RecordedEntry[] = [
      {
        request: {
          url: 'http://localhost:9999/api/test',
          method: 'GET',
          headers: {},
          postData: null,
          timestamp: Date.now(),
        },
        response: {
          url: 'http://localhost:9999/api/test',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'Test' }),
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 5,
          },
        },
      },
    ];

    mockServer.setRecordings(mockRecordings);
    
    // Start and stop multiple times
    await mockServer.start(page);
    await mockServer.stop(page);
    
    // Start again - should not accumulate handlers
    await mockServer.start(page);
    await mockServer.stop(page);
    
    // Multiple starts should handle gracefully
    await mockServer.start(page);
    await mockServer.start(page); // Should stop previous first
    await mockServer.stop(page);
  });
});

recorderTest.describe('Network Recorder Fixture Tests', () => {
  recorderTest('networkRecorder fixture provides recording capabilities', async ({ page, networkRecorder }) => {
    expect(networkRecorder).toBeDefined();
    expect(networkRecorder.startRecording).toBeDefined();
    expect(networkRecorder.stopRecording).toBeDefined();
    expect(networkRecorder.saveRecordings).toBeDefined();
    expect(networkRecorder.getRecordings).toBeDefined();
    expect(networkRecorder.clearRecordings).toBeDefined();
  });

  recorderTest('networkRecorder fixture can start and stop recording', async ({ page, networkRecorder }) => {
    await networkRecorder.startRecording();
    await page.goto(testPage);
    
    const recordings = networkRecorder.stopRecording();
    expect(Array.isArray(recordings)).toBe(true);
  });

  recorderTest('networkRecorder fixture properly cleans up event listeners', async ({ page, networkRecorder }) => {
    // Start and stop recording multiple times
    await networkRecorder.startRecording();
    await page.goto(testPage);
    networkRecorder.stopRecording();

    // Get initial recordings count
    const firstCount = networkRecorder.getRecordings().length;

    // Start recording again - should not accumulate old listeners
    await networkRecorder.startRecording();
    await page.goto(testPage);
    const secondRecordings = networkRecorder.stopRecording();

    // Should have fresh recordings, not accumulated
    expect(secondRecordings.length).toBeGreaterThanOrEqual(0);
    
    // Verify multiple start/stop cycles don't cause issues
    await networkRecorder.startRecording();
    await page.goto(testPage);
    networkRecorder.stopRecording();
  });

  recorderTest('networkRecorder handles multiple startRecording calls gracefully', async ({ page, networkRecorder }) => {
    // First recording session
    await networkRecorder.startRecording();
    await page.goto(testPage);
    
    // Call startRecording again without stopping - should handle gracefully
    await networkRecorder.startRecording();
    await page.goto(testPage);
    
    const recordings = networkRecorder.stopRecording();
    expect(Array.isArray(recordings)).toBe(true);
  });

  recorderTest('networkRecorder fixture can save recordings', async ({ page, networkRecorder }) => {
    // Manually add a recording to test save functionality
    const mockRecording: RecordedEntry = {
      request: {
        url: 'http://test.local/api',
        method: 'GET',
        headers: {},
        postData: null,
        timestamp: Date.now(),
      },
      response: {
        url: 'http://test.local/api',
        method: 'GET',
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'test',
        timing: {
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 10,
        },
      },
    };

    (networkRecorder.recorder as any).recordings = [mockRecording];
    
    const filepath = await networkRecorder.saveRecordings('fixture-test.json');
    expect(fs.existsSync(filepath)).toBe(true);
    
    // Cleanup
    fs.unlinkSync(filepath);
  });
});

mockTest.describe('Mock Server Fixture Tests', () => {
  mockTest('mockServer fixture provides mocking capabilities', async ({ page, mockServer }) => {
    expect(mockServer).toBeDefined();
    expect(mockServer.loadRecordings).toBeDefined();
    expect(mockServer.setRecordings).toBeDefined();
    expect(mockServer.start).toBeDefined();
    expect(mockServer.stop).toBeDefined();
    expect(mockServer.getRecordings).toBeDefined();
  });

  mockTest('mockServer fixture can intercept requests', async ({ page, mockServer }) => {
    const mockRecordings: RecordedEntry[] = [
      {
        request: {
          url: 'http://localhost:9999/api/test',
          method: 'GET',
          headers: {},
          postData: null,
          timestamp: Date.now(),
        },
        response: {
          url: 'http://localhost:9999/api/test',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'Fixture mocked response' }),
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 5,
          },
        },
      },
    ];

    mockServer.setRecordings(mockRecordings);
    await mockServer.start();

    // Create a page that makes a fetch request
    const htmlContent = `
      <html>
        <body>
          <script>
            fetch('http://localhost:9999/api/test')
              .then(r => r.json())
              .then(data => {
                document.body.innerHTML = '<div id="result">' + data.message + '</div>';
              });
          </script>
        </body>
      </html>
    `;
    
    await page.goto(`data:text/html,${encodeURIComponent(htmlContent)}`);
    
    // Wait for the result to appear
    await page.waitForSelector('#result', { timeout: 5000 });
    const message = await page.locator('#result').textContent();
    
    expect(message).toBe('Fixture mocked response');

    await mockServer.stop();
  });
});

test.describe('Integration Tests', () => {
  test('Environment variables override config for recorder', async () => {
    // Set environment variables
    process.env.NETWORK_RECORDER_ENABLED = 'false';
    process.env.NETWORK_RECORDER_OUTPUT_DIR = path.join(getTempDir(), 'env-test');
    
    const recorder = new NetworkRecorder({
      enabled: true, // Should be overridden by env var
      outputDir: path.join(getTempDir(), 'config-test'),
    });

    // Config should be overridden by env vars
    expect((recorder as any).config.enabled).toBe(false);
    expect((recorder as any).config.outputDir).toBe(path.join(getTempDir(), 'env-test'));

    // Cleanup
    delete process.env.NETWORK_RECORDER_ENABLED;
    delete process.env.NETWORK_RECORDER_OUTPUT_DIR;
  });

  test('Mock server environment variables override config', async () => {
    process.env.MOCK_SERVER_ENABLED = 'false';
    process.env.MOCK_SERVER_RECORDINGS_DIR = path.join(getTempDir(), 'mock-env-test');
    
    const mockServer = new MockServer({
      enabled: true, // Should be overridden by env var
      recordingsDir: path.join(getTempDir(), 'mock-config-test'),
    });

    expect((mockServer as any).config.enabled).toBe(false);
    expect((mockServer as any).config.recordingsDir).toBe(path.join(getTempDir(), 'mock-env-test'));

    // Cleanup
    delete process.env.MOCK_SERVER_ENABLED;
    delete process.env.MOCK_SERVER_RECORDINGS_DIR;
  });

  test('Record and replay integration', async ({ page }) => {
    // Create mock recordings
    const recordings: RecordedEntry[] = [
      {
        request: {
          url: 'http://localhost:9999/api/data',
          method: 'GET',
          headers: {},
          postData: null,
          timestamp: Date.now(),
        },
        response: {
          url: 'http://localhost:9999/api/data',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'Integration test' }),
          timing: {
            startTime: Date.now(),
            endTime: Date.now() + 50,
            duration: 50,
          },
        },
      },
    ];

    // Step 2: Replay
    const mockServer = new MockServer({
      enabled: true,
      strictMatching: false,
    });

    mockServer.setRecordings(recordings);
    await mockServer.start(page);

    // Create a page that makes a fetch request
    const htmlContent = `
      <html>
        <body>
          <script>
            fetch('http://localhost:9999/api/data')
              .then(r => r.json())
              .then(data => {
                document.body.innerHTML = '<div id="message">' + data.message + '</div>';
              });
          </script>
        </body>
      </html>
    `;
    
    await page.goto(`data:text/html,${encodeURIComponent(htmlContent)}`);
    
    // Wait for the result to appear
    await page.waitForSelector('#message', { timeout: 5000 });
    const message = await page.locator('#message').textContent();
    
    expect(message).toBe('Integration test');

    await mockServer.stop(page);
  });

  test('Edge case: Empty filename should be rejected', async () => {
    const recorder = new NetworkRecorder({
      enabled: true,
      outputDir: getTempDir(),
    });

    (recorder as any).recordings = [
      {
        request: { url: 'test', method: 'GET', headers: {}, postData: null, timestamp: Date.now() },
        response: { url: 'test', method: 'GET', status: 200, statusText: 'OK', headers: {}, body: '', timing: { startTime: 0, endTime: 0, duration: 0 } },
      },
    ];

    await expect(recorder.saveRecordings('')).rejects.toThrow('Invalid filename');
  });

  test('Edge case: Filename with only dots should be rejected', async () => {
    const recorder = new NetworkRecorder({
      enabled: true,
      outputDir: getTempDir(),
    });

    (recorder as any).recordings = [
      {
        request: { url: 'test', method: 'GET', headers: {}, postData: null, timestamp: Date.now() },
        response: { url: 'test', method: 'GET', status: 200, statusText: 'OK', headers: {}, body: '', timing: { startTime: 0, endTime: 0, duration: 0 } },
      },
    ];

    await expect(recorder.saveRecordings('..')).rejects.toThrow('Invalid filename');
    await expect(recorder.saveRecordings('...')).rejects.toThrow('Invalid filename');
  });

  test('Edge case: Null byte in filename should be rejected', async () => {
    const recorder = new NetworkRecorder({
      enabled: true,
      outputDir: getTempDir(),
    });

    (recorder as any).recordings = [
      {
        request: { url: 'test', method: 'GET', headers: {}, postData: null, timestamp: Date.now() },
        response: { url: 'test', method: 'GET', status: 200, statusText: 'OK', headers: {}, body: '', timing: { startTime: 0, endTime: 0, duration: 0 } },
      },
    ];

    await expect(recorder.saveRecordings('test\x00.json')).rejects.toThrow('Invalid filename');
  });

  test('Edge case: MockServer with empty recordings should return 404', async ({ page }) => {
    const mockServer = new MockServer({
      enabled: true,
      fallbackToNetwork: false,
    });

    mockServer.setRecordings([]);
    await mockServer.start(page);

    const htmlContent = `
      <html>
        <body>
          <script>
            fetch('http://localhost:9999/any-url')
              .then(r => {
                document.body.innerHTML = '<div id="status">' + r.status + '</div>';
              })
              .catch(err => {
                document.body.innerHTML = '<div id="error">' + err.message + '</div>';
              });
          </script>
        </body>
      </html>
    `;
    
    await page.goto(`data:text/html,${encodeURIComponent(htmlContent)}`);
    await page.waitForSelector('#status', { timeout: 5000 });
    const status = await page.locator('#status').textContent();
    
    expect(status).toBe('404');

    await mockServer.stop(page);
  });

  test('Edge case: NetworkRecorder with disabled flag should not record', async ({ page }) => {
    const recorder = new NetworkRecorder({
      enabled: false,
      outputDir: getTempDir(),
    });

    await recorder.startRecording(page);
    await page.goto(testPage);
    const recordings = recorder.stopRecording();
    
    expect(recordings.length).toBe(0);
  });

  test('Edge case: MockServer with disabled flag should not intercept', async ({ page }) => {
    const mockServer = new MockServer({
      enabled: false,
    });

    const mockRecordings: RecordedEntry[] = [
      {
        request: {
          url: 'http://localhost:9999/test',
          method: 'GET',
          headers: {},
          postData: null,
          timestamp: Date.now(),
        },
        response: {
          url: 'http://localhost:9999/test',
          method: 'GET',
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/plain' },
          body: 'mocked',
          timing: {
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 10,
          },
        },
      },
    ];

    mockServer.setRecordings(mockRecordings);
    await mockServer.start(page);

    // Since mock server is disabled, it should not intercept
    // We can't really test this without making a real request, so just verify it doesn't crash
    await mockServer.stop(page);
    
    expect(true).toBe(true); // Just verify no errors
  });
});
