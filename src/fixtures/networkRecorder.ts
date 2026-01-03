import { test as base } from '@playwright/test';
import { NetworkRecorder, MockServer, NetworkRecorderConfig, MockServerConfig, RecordedEntry } from '../utils/networkRecorder';
import * as path from 'path';

/**
 * Network recorder options for fixture
 */
export interface NetworkRecorderFixtureOptions {
  recorder: NetworkRecorder;
  startRecording: () => Promise<void>;
  stopRecording: () => RecordedEntry[];
  saveRecordings: (filename?: string) => Promise<string>;
  getRecordings: () => RecordedEntry[];
  clearRecordings: () => void;
}

/**
 * Mock server options for fixture
 */
export interface MockServerFixtureOptions {
  mockServer: MockServer;
  loadRecordings: (filename: string) => void;
  setRecordings: (recordings: RecordedEntry[]) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getRecordings: () => RecordedEntry[];
}

/**
 * Network recorder fixture providing HTTP request/response recording
 * Records all network traffic during test execution
 */
export const networkRecorderFixture = base.extend<{ networkRecorder: NetworkRecorderFixtureOptions }>({
  networkRecorder: async ({ page }, use, testInfo) => {
    // Create recorder with config
    const config: NetworkRecorderConfig = {
      enabled: true,
      outputDir: path.join(testInfo.project.outputDir, 'network-recordings'),
    };

    const recorder = new NetworkRecorder(config);

    const fixture: NetworkRecorderFixtureOptions = {
      recorder,
      startRecording: async () => {
        await recorder.startRecording(page);
      },
      stopRecording: () => {
        return recorder.stopRecording();
      },
      saveRecordings: async (filename?: string) => {
        const testFileName = filename || `${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}.json`;
        return await recorder.saveRecordings(testFileName);
      },
      getRecordings: () => {
        return recorder.getRecordings();
      },
      clearRecordings: () => {
        recorder.clearRecordings();
      },
    };

    await use(fixture);

    // Cleanup: stop recording if still active
    recorder.stopRecording();
  },
});

/**
 * Mock server fixture providing HTTP request/response replay
 * Intercepts network requests and responds with recorded data
 */
export const mockServerFixture = base.extend<{ mockServer: MockServerFixtureOptions }>({
  mockServer: async ({ page }, use, testInfo) => {
    // Create mock server with config
    const config: MockServerConfig = {
      enabled: true,
      recordingsDir: path.join(testInfo.project.outputDir, 'network-recordings'),
    };

    const server = new MockServer(config);

    const fixture: MockServerFixtureOptions = {
      mockServer: server,
      loadRecordings: (filename: string) => {
        server.loadRecordings(filename);
      },
      setRecordings: (recordings: RecordedEntry[]) => {
        server.setRecordings(recordings);
      },
      start: async () => {
        await server.start(page);
      },
      stop: async () => {
        await server.stop(page);
      },
      getRecordings: () => {
        return server.getRecordings();
      },
    };

    await use(fixture);

    // Cleanup: stop mock server if still active
    await server.stop(page);
  },
});
