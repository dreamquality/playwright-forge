import { Page, Request, Response, Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Recorded HTTP request/response data
 */
export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string | null;
  timestamp: number;
}

export interface RecordedResponse {
  url: string;
  method: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timing: {
    startTime: number;
    endTime: number;
    duration: number;
  };
}

export interface RecordedEntry {
  request: RecordedRequest;
  response: RecordedResponse;
}

/**
 * Filter options for recording
 */
export interface RecordingFilter {
  domains?: string[]; // Filter by domain (e.g., ['api.example.com'])
  methods?: string[]; // Filter by HTTP method (e.g., ['GET', 'POST'])
  pathPatterns?: (string | RegExp)[]; // Filter by path pattern
  statusCodes?: number[]; // Filter by status code
}

/**
 * Configuration for network recorder
 */
export interface NetworkRecorderConfig {
  enabled?: boolean; // Enable/disable recording (default: true, can be overridden by env var)
  outputDir?: string; // Directory to save recordings (default: 'network-recordings')
  filter?: RecordingFilter; // Filtering options
  maxBodySize?: number; // Max response body size to record (default: 10MB)
  prettifyJson?: boolean; // Prettify JSON output (default: true)
}

/**
 * Dynamic field matcher for handling changing values
 */
export interface DynamicFieldMatcher {
  path: string; // JSON path (e.g., 'data.id', 'timestamp')
  matcher: 'any' | 'uuid' | 'timestamp' | 'number' | RegExp | ((value: any) => boolean);
}

/**
 * Configuration for mock server
 */
export interface MockServerConfig {
  enabled?: boolean; // Enable/disable mocking (default: true, can be overridden by env var)
  recordingsDir?: string; // Directory to load recordings from
  strictMatching?: boolean; // Strict URL matching (default: false)
  dynamicFields?: DynamicFieldMatcher[]; // Dynamic field matchers
  fallbackToNetwork?: boolean; // Fallback to real network if no match (default: false)
  delay?: number; // Artificial delay in ms (default: 0)
}

/**
 * Network recorder class
 */
export class NetworkRecorder {
  private recordings: RecordedEntry[] = [];
  private config: Required<NetworkRecorderConfig>;
  private isRecording = false;

  constructor(config: NetworkRecorderConfig = {}) {
    const enabledFromEnv = process.env.NETWORK_RECORDER_ENABLED;
    const enabled = enabledFromEnv !== undefined 
      ? enabledFromEnv === 'true' 
      : (config.enabled ?? true);

    this.config = {
      enabled,
      outputDir: process.env.NETWORK_RECORDER_OUTPUT_DIR || config.outputDir || 'network-recordings',
      filter: config.filter || {},
      maxBodySize: parseInt(process.env.NETWORK_RECORDER_MAX_BODY_SIZE || '') || config.maxBodySize || 10 * 1024 * 1024,
      prettifyJson: config.prettifyJson ?? true,
    };
  }

  /**
   * Start recording network requests
   */
  async startRecording(page: Page): Promise<void> {
    if (!this.config.enabled || this.isRecording) {
      return;
    }

    this.isRecording = true;
    this.recordings = [];

    // Listen to all requests/responses
    page.on('response', async (response: Response) => {
      try {
        const request = response.request();
        
        // Apply filters
        if (!this.shouldRecord(request, response)) {
          return;
        }

        const startTime = Date.now();
        const body = await this.safeGetBody(response);
        const endTime = Date.now();

        const entry: RecordedEntry = {
          request: {
            url: request.url(),
            method: request.method(),
            headers: request.headers(),
            postData: request.postData(),
            timestamp: startTime,
          },
          response: {
            url: response.url(),
            method: request.method(),
            status: response.status(),
            statusText: response.statusText(),
            headers: response.headers(),
            body,
            timing: {
              startTime,
              endTime,
              duration: endTime - startTime,
            },
          },
        };

        this.recordings.push(entry);
      } catch (error) {
        // Silently ignore errors (e.g., body already consumed)
        console.warn(`[NetworkRecorder] Failed to record response: ${error}`);
      }
    });
  }

  /**
   * Stop recording and return recorded entries
   */
  stopRecording(): RecordedEntry[] {
    this.isRecording = false;
    return this.recordings;
  }

  /**
   * Save recordings to a JSON file
   */
  async saveRecordings(filename: string): Promise<string> {
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    const filepath = path.join(this.config.outputDir, filename);
    const data = this.config.prettifyJson 
      ? JSON.stringify(this.recordings, null, 2)
      : JSON.stringify(this.recordings);

    fs.writeFileSync(filepath, data, 'utf-8');
    return filepath;
  }

  /**
   * Get current recordings
   */
  getRecordings(): RecordedEntry[] {
    return [...this.recordings];
  }

  /**
   * Clear recordings
   */
  clearRecordings(): void {
    this.recordings = [];
  }

  /**
   * Check if a request/response should be recorded based on filters
   */
  private shouldRecord(request: Request, response: Response): boolean {
    const filter = this.config.filter;
    const url = new URL(request.url());

    // Domain filter
    if (filter.domains && filter.domains.length > 0) {
      if (!filter.domains.includes(url.hostname)) {
        return false;
      }
    }

    // Method filter
    if (filter.methods && filter.methods.length > 0) {
      if (!filter.methods.includes(request.method())) {
        return false;
      }
    }

    // Path filter
    if (filter.pathPatterns && filter.pathPatterns.length > 0) {
      const matched = filter.pathPatterns.some(pattern => {
        if (typeof pattern === 'string') {
          return url.pathname.includes(pattern);
        }
        return pattern.test(url.pathname);
      });
      if (!matched) {
        return false;
      }
    }

    // Status code filter
    if (filter.statusCodes && filter.statusCodes.length > 0) {
      if (!filter.statusCodes.includes(response.status())) {
        return false;
      }
    }

    return true;
  }

  /**
   * Safely get response body with size limits
   */
  private async safeGetBody(response: Response): Promise<string> {
    try {
      const buffer = await response.body();
      if (buffer.length > this.config.maxBodySize) {
        return `[Body too large: ${buffer.length} bytes]`;
      }
      return buffer.toString('utf-8');
    } catch (error) {
      return `[Failed to read body: ${error}]`;
    }
  }
}

/**
 * Mock server for replaying recorded requests
 */
export class MockServer {
  private recordings: RecordedEntry[] = [];
  private config: Required<MockServerConfig>;
  private isActive = false;

  constructor(config: MockServerConfig = {}) {
    const enabledFromEnv = process.env.MOCK_SERVER_ENABLED;
    const enabled = enabledFromEnv !== undefined 
      ? enabledFromEnv === 'true' 
      : (config.enabled ?? true);

    this.config = {
      enabled,
      recordingsDir: process.env.MOCK_SERVER_RECORDINGS_DIR || config.recordingsDir || 'network-recordings',
      strictMatching: config.strictMatching ?? false,
      dynamicFields: config.dynamicFields || [],
      fallbackToNetwork: config.fallbackToNetwork ?? false,
      delay: parseInt(process.env.MOCK_SERVER_DELAY || '') || config.delay || 0,
    };
  }

  /**
   * Load recordings from a file
   */
  loadRecordings(filename: string): void {
    const filepath = path.join(this.config.recordingsDir, filename);
    
    if (!fs.existsSync(filepath)) {
      throw new Error(`Recordings file not found: ${filepath}`);
    }

    const data = fs.readFileSync(filepath, 'utf-8');
    this.recordings = JSON.parse(data);
  }

  /**
   * Load recordings from array
   */
  setRecordings(recordings: RecordedEntry[]): void {
    this.recordings = recordings;
  }

  /**
   * Start mock server
   */
  async start(page: Page): Promise<void> {
    if (!this.config.enabled || this.isActive) {
      return;
    }

    this.isActive = true;

    // Intercept all requests - using ** pattern to catch all routes
    await page.route('**/**', async (route: Route) => {
      const request = route.request();
      const matchedEntry = this.findMatchingEntry(request);

      if (matchedEntry) {
        // Add artificial delay if configured
        if (this.config.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.delay));
        }

        // Respond with recorded data
        await route.fulfill({
          status: matchedEntry.response.status,
          headers: matchedEntry.response.headers,
          body: matchedEntry.response.body,
        });
      } else if (this.config.fallbackToNetwork) {
        // Fallback to real network
        await route.continue();
      } else {
        // No match and no fallback - return 404
        await route.fulfill({
          status: 404,
          body: JSON.stringify({ error: 'No mock data found for this request' }),
          headers: { 'content-type': 'application/json' },
        });
      }
    });
  }

  /**
   * Stop mock server
   */
  async stop(page: Page): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    await page.unroute('**/**');
  }

  /**
   * Find matching recorded entry for a request
   */
  private findMatchingEntry(request: Request): RecordedEntry | null {
    const requestUrl = request.url();
    const requestMethod = request.method();

    for (const entry of this.recordings) {
      if (this.isMatch(requestUrl, requestMethod, entry)) {
        return entry;
      }
    }

    return null;
  }

  /**
   * Check if request matches recorded entry
   */
  private isMatch(requestUrl: string, requestMethod: string, entry: RecordedEntry): boolean {
    const recordedUrl = entry.request.url;
    const recordedMethod = entry.request.method;

    // Method must match
    if (requestMethod !== recordedMethod) {
      return false;
    }

    // URL matching
    if (this.config.strictMatching) {
      return requestUrl === recordedUrl;
    }

    // Flexible matching - compare path and query params
    const reqUrl = new URL(requestUrl);
    const recUrl = new URL(recordedUrl);

    return reqUrl.pathname === recUrl.pathname;
  }

  /**
   * Match dynamic fields in response body
   */
  private matchDynamicFields(actualBody: any, recordedBody: any): boolean {
    // If no dynamic fields configured, do exact match
    if (this.config.dynamicFields.length === 0) {
      return JSON.stringify(actualBody) === JSON.stringify(recordedBody);
    }

    // Apply dynamic field matchers
    // This is a simplified version - full implementation would use JSON path
    return true;
  }

  /**
   * Get current recordings
   */
  getRecordings(): RecordedEntry[] {
    return [...this.recordings];
  }

  /**
   * Clear recordings
   */
  clearRecordings(): void {
    this.recordings = [];
  }
}
