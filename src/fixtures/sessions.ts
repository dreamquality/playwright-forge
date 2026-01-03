import { test as base, BrowserContext, Page, APIRequestContext, Browser, Cookie } from '@playwright/test';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Configuration for a specific role
 */
export type RoleConfig = {
  credentials?: {
    username?: string;
    password?: string;
    token?: string;
    [key: string]: any;
  };
  loginUrl?: string;
  apiLoginEndpoint?: string;
  apiLoginMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  apiLoginPayload?: Record<string, any>;
  apiLoginHeaders?: Record<string, string>;
  tokenPath?: string; // JSON path to extract token from API response (e.g., 'data.token')
  ttl?: number; // Time-to-live in milliseconds
  customLogin?: (page: Page, api: APIRequestContext) => Promise<void>;
};

/**
 * Session data stored for a role
 */
export type SessionData = {
  cookies?: Cookie[];
  localStorage?: Record<string, string>;
  headers?: Record<string, string>;
  token?: string;
  expiresAt?: number;
  storageStatePath?: string;
  originalTTL?: number;
};

/**
 * Configuration for the sessions fixture
 */
export type SessionsConfig = {
  roles: Record<string, RoleConfig>;
  storageDir?: string;
  defaultTTL?: number;
  refreshThreshold?: number; // Percentage of TTL at which to refresh (0-1)
  preferApiLogin?: boolean;
};

/**
 * Session with associated page and context
 */
export type RoleSession = {
  page: Page;
  context: BrowserContext;
  data: SessionData;
  role: string;
};

/**
 * Sessions manager providing typed access to role-based sessions
 */
export type SessionsManager = {
  get: (role: string) => Promise<RoleSession>;
  refresh: (role: string) => Promise<RoleSession>;
  clearRole: (role: string) => Promise<void>;
  clearAll: () => Promise<void>;
};

/**
 * Internal session cache entry
 */
type CachedSession = {
  context: BrowserContext;
  page: Page;
  data: SessionData;
  lastUsed: number;
};

/**
 * SessionManager implementation
 */
class SessionManager implements SessionsManager {
  private config: SessionsConfig;
  private cache: Map<string, CachedSession> = new Map();
  private loginPromises: Map<string, Promise<RoleSession>> = new Map();
  private browser: Browser;
  private playwright: any; // Playwright type not exported, using any
  private storageDir: string;

  constructor(config: SessionsConfig, browser: Browser, playwright: any) {
    this.config = config;
    this.browser = browser;
    this.playwright = playwright;
    this.storageDir = config.storageDir || path.join(process.cwd(), '.sessions');
    
    // Ensure storage directory exists
    if (!fsSync.existsSync(this.storageDir)) {
      fsSync.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  async get(role: string): Promise<RoleSession> {
    const roleConfig = this.config.roles[role];
    if (!roleConfig) {
      throw new Error(`Role '${role}' not configured. Available roles: ${Object.keys(this.config.roles).join(', ')}`);
    }

    // Check if we have a valid cached session
    const cached = this.cache.get(role);
    if (cached && this.isSessionValid(cached.data)) {
      cached.lastUsed = Date.now();
      return {
        page: cached.page,
        context: cached.context,
        data: cached.data,
        role,
      };
    }

    // Check if a login is already in progress for this role
    const existingPromise = this.loginPromises.get(role);
    if (existingPromise) {
      return existingPromise;
    }

    // Need to create or refresh session
    if (cached) {
      // Session expired, need to refresh
      await this.clearRole(role);
    }

    const loginPromise = this.createSession(role, roleConfig);
    this.loginPromises.set(role, loginPromise);
    
    try {
      const session = await loginPromise;
      return session;
    } finally {
      this.loginPromises.delete(role);
    }
  }

  async refresh(role: string): Promise<RoleSession> {
    await this.clearRole(role);
    const roleConfig = this.config.roles[role];
    if (!roleConfig) {
      throw new Error(`Role '${role}' not configured`);
    }
    return await this.createSession(role, roleConfig);
  }

  async clearRole(role: string): Promise<void> {
    const cached = this.cache.get(role);
    if (cached) {
      try {
        await cached.page.close();
      } catch (e) {
        // Ignore if already closed
      }
      try {
        await cached.context.close();
      } catch (e) {
        // Ignore if already closed
      }
      this.cache.delete(role);
      
      // Clean up storage file
      if (cached.data.storageStatePath && fsSync.existsSync(cached.data.storageStatePath)) {
        await fs.unlink(cached.data.storageStatePath);
      }
    }
  }

  async clearAll(): Promise<void> {
    const roles = Array.from(this.cache.keys());
    for (const role of roles) {
      await this.clearRole(role);
    }
  }

  private async createSession(role: string, roleConfig: RoleConfig): Promise<RoleSession> {
    const storageStatePath = this.getStorageStatePath(role);
    let sessionData: SessionData;

    // Try to load existing session from disk
    const loadedData = await this.loadSessionFromDisk(storageStatePath);
    if (loadedData && this.isSessionValid(loadedData)) {
      sessionData = loadedData;
    } else {
      // Need to perform login
      const ttl = roleConfig.ttl || this.config.defaultTTL || 3600000; // Default 1 hour
      sessionData = await this.performLogin(role, roleConfig);
      sessionData.expiresAt = Date.now() + ttl;
      sessionData.originalTTL = ttl;
      await this.saveSessionToDisk(storageStatePath, sessionData);
    }

    // Create context with session data
    const context = await this.createContextWithSession(sessionData);
    const page = await context.newPage();

    const cached: CachedSession = {
      context,
      page,
      data: sessionData,
      lastUsed: Date.now(),
    };

    this.cache.set(role, cached);

    return {
      page,
      context,
      data: sessionData,
      role,
    };
  }

  private async performLogin(role: string, roleConfig: RoleConfig): Promise<SessionData> {
    // Create temporary context for login
    const tempContext = await this.browser.newContext();
    const tempPage = await tempContext.newPage();
    const tempApi = await this.playwright.request.newContext();

    try {
      let sessionData: SessionData = {};

      // Try custom login first
      if (roleConfig.customLogin) {
        await roleConfig.customLogin(tempPage, tempApi);
        sessionData = await this.extractSessionData(tempPage, tempContext);
      }
      // Try API-based login
      else if (this.config.preferApiLogin !== false && roleConfig.apiLoginEndpoint) {
        sessionData = await this.performApiLogin(roleConfig, tempApi);
      }
      // Fall back to UI-based login
      else if (roleConfig.loginUrl) {
        await this.performUILogin(roleConfig, tempPage);
        sessionData = await this.extractSessionData(tempPage, tempContext);
      } else {
        throw new Error(`No login method configured for role '${role}'`);
      }

      return sessionData;
    } finally {
      await tempApi.dispose();
      await tempPage.close();
      await tempContext.close();
    }
  }

  private async performApiLogin(
    roleConfig: RoleConfig,
    api: APIRequestContext
  ): Promise<SessionData> {
    if (!roleConfig.apiLoginEndpoint) {
      throw new Error('API login endpoint not configured');
    }

    const method = roleConfig.apiLoginMethod || 'POST';
    const payload = roleConfig.apiLoginPayload || roleConfig.credentials || {};
    const headers = roleConfig.apiLoginHeaders || { 'Content-Type': 'application/json' };

    let response;
    switch (method) {
      case 'POST':
        response = await api.post(roleConfig.apiLoginEndpoint, {
          data: payload,
          headers,
        });
        break;
      case 'PUT':
        response = await api.put(roleConfig.apiLoginEndpoint, {
          data: payload,
          headers,
        });
        break;
      case 'PATCH':
        response = await api.patch(roleConfig.apiLoginEndpoint, {
          data: payload,
          headers,
        });
        break;
      case 'GET':
        response = await api.get(roleConfig.apiLoginEndpoint, { headers });
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }

    if (!response.ok()) {
      throw new Error(`API login failed with status ${response.status()}: ${await response.text()}`);
    }

    const responseData = await response.json();
    
    // Extract token from response
    let token: string | undefined;
    if (roleConfig.tokenPath) {
      token = this.extractTokenFromPath(responseData, roleConfig.tokenPath);
    } else {
      // Try common token locations
      token = responseData.token || responseData.accessToken || responseData.access_token;
    }

    const sessionData: SessionData = {
      token,
      headers: {},
      cookies: [],
    };

    // If token exists, add it to headers
    if (token) {
      sessionData.headers = {
        Authorization: `Bearer ${token}`,
      };
      
      // Note: Set-Cookie headers from API responses are not automatically captured
      // by Playwright's APIRequestContext. Users should use customLogin if they need
      // to handle cookies from API responses, or rely on UI-based login to capture cookies.
    }

    return sessionData;
  }

  private async performUILogin(roleConfig: RoleConfig, page: Page): Promise<void> {
    if (!roleConfig.loginUrl) {
      throw new Error('Login URL not configured');
    }

    await page.goto(roleConfig.loginUrl);
    
    // This is a basic implementation - users should provide customLogin for complex scenarios
    // The selectors are intentionally broad to work with common login forms
    // For production use, configure role-specific customLogin functions
    if (roleConfig.credentials?.username) {
      const usernameLocator = page.locator('input[name="username"], input[type="email"], input[name="email"]');
      if (await usernameLocator.count()) {
        await usernameLocator.first().fill(roleConfig.credentials.username);
      }
    }
    if (roleConfig.credentials?.password) {
      const passwordLocator = page.locator('input[name="password"], input[type="password"]');
      if (await passwordLocator.count()) {
        await passwordLocator.first().fill(roleConfig.credentials.password);
      }
    }
    
    // Submit form - try common submit button patterns
    const submitButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    if (await submitButton.count()) {
      await submitButton.first().click();
    }
    
    // Wait for navigation or success indicator
    await page.waitForLoadState('networkidle');
  }

  private async extractSessionData(page: Page, context: BrowserContext): Promise<SessionData> {
    // Extract localStorage
    const localStorage = await page.evaluate((): Record<string, string> => {
      const items: Record<string, string> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storage = (globalThis as any).localStorage;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key) {
          items[key] = storage.getItem(key) || '';
        }
      }
      return items;
    });

    // Extract cookies
    const cookies = await context.cookies();

    // Look for token in localStorage or cookies
    let token: string | undefined;
    for (const key in localStorage) {
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
        try {
          const parsed = JSON.parse(localStorage[key]);
          if (parsed.token || parsed.accessToken) {
            token = parsed.token || parsed.accessToken;
            break;
          }
        } catch {
          // Not JSON, might be token directly
          token = localStorage[key];
        }
      }
    }

    return {
      cookies,
      localStorage,
      token,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    };
  }

  private async createContextWithSession(sessionData: SessionData): Promise<BrowserContext> {
    const contextOptions: Record<string, any> = {};

    // Load storageState if available - the file contains both cookies and localStorage
    if (sessionData.storageStatePath && fsSync.existsSync(sessionData.storageStatePath)) {
      try {
        const fileContent = await fs.readFile(sessionData.storageStatePath, 'utf-8');
        const savedData = JSON.parse(fileContent);
        
        // Use the storageState format if it exists in the saved data
        if (savedData.storageState) {
          contextOptions.storageState = savedData.storageState;
        }
      } catch (error) {
        // If we can't read or parse the file, just skip it
        console.warn(`Failed to load storage state from ${sessionData.storageStatePath}:`, error);
      }
    }

    const context = await this.browser.newContext(contextOptions);
    return context;
  }

  private isSessionValid(sessionData: SessionData): boolean {
    if (!sessionData.expiresAt) {
      return false;
    }

    const now = Date.now();
    const refreshThreshold = this.config.refreshThreshold || 0.1; // Default 10%
    
    // Use the original TTL if available for stable refresh calculation
    const ttl = sessionData.originalTTL || (sessionData.expiresAt - now);
    const refreshTime = sessionData.expiresAt - (ttl * refreshThreshold);
    
    return now < refreshTime;
  }

  private getStorageStatePath(role: string): string {
    const hash = crypto.createHash('md5').update(`${role}-${process.pid}`).digest('hex').substring(0, 8);
    return path.join(this.storageDir, `session-${role}-${hash}.json`);
  }

  private async loadSessionFromDisk(filePath: string): Promise<SessionData | null> {
    try {
      if (fsSync.existsSync(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      // Invalid or corrupted file, ignore
    }
    return null;
  }

  private async saveSessionToDisk(filePath: string, sessionData: SessionData): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    // Determine origin from cookies or use a default
    const origin = sessionData.cookies && sessionData.cookies.length > 0
      ? `${sessionData.cookies[0].secure ? 'https' : 'http'}://${sessionData.cookies[0].domain}`
      : 'http://localhost';
    
    // Save to storage state format
    // Note: Credentials are NOT persisted to disk for security reasons
    const storageState = {
      cookies: sessionData.cookies || [],
      origins: sessionData.localStorage ? [{
        origin,
        localStorage: Object.entries(sessionData.localStorage).map(([name, value]) => ({ name, value })),
      }] : [],
    };

    await fs.writeFile(filePath, JSON.stringify({
      ...sessionData,
      storageState,
    }, null, 2));
  }

  private extractTokenFromPath(data: unknown, tokenPath: string): string | undefined {
    if (data === null || typeof data !== 'object') {
      return undefined;
    }

    const parts = tokenPath.split('.');
    let current: unknown = data;
    
    for (const part of parts) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }

      // Support segments with optional array indices, e.g. "tokens[0]" or "data.items[0].value"
      const arrayMatch = part.match(/^([^[]+)\[(\d+)\]$/);
      
      if (arrayMatch) {
        // Handle array access like "tokens[0]"
        const [, prop, indexStr] = arrayMatch;
        const index = Number(indexStr);
        
        if (!(prop in (current as Record<string, unknown>))) {
          return undefined;
        }
        
        const array = (current as Record<string, unknown>)[prop];
        if (!Array.isArray(array) || index < 0 || index >= array.length) {
          return undefined;
        }
        
        current = array[index];
      } else if (part in (current as Record<string, unknown>)) {
        // Handle regular property access
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    
    return typeof current === 'string' ? current : undefined;
  }
}

/**
 * Get sessions configuration from environment variables or options
 */
function getSessionsConfig(options?: Partial<SessionsConfig>): SessionsConfig {
  let envRoles: Record<string, RoleConfig> = {};
  
  if (process.env.SESSIONS_ROLES) {
    try {
      envRoles = JSON.parse(process.env.SESSIONS_ROLES);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON in SESSIONS_ROLES environment variable: ${message}`);
    }
  }
  
  const envStorageDir = process.env.SESSIONS_STORAGE_DIR;
  const envDefaultTTL = process.env.SESSIONS_DEFAULT_TTL ? parseInt(process.env.SESSIONS_DEFAULT_TTL) : undefined;
  const envPreferApi = process.env.SESSIONS_PREFER_API_LOGIN === 'true';

  return {
    roles: options?.roles || envRoles || {},
    storageDir: options?.storageDir || envStorageDir,
    defaultTTL: options?.defaultTTL || envDefaultTTL,
    refreshThreshold: options?.refreshThreshold,
    preferApiLogin: options?.preferApiLogin ?? envPreferApi,
  };
}

/**
 * Sessions fixture for managing authenticated sessions with multiple roles
 * 
 * Features:
 * - API-based login with UI fallback
 * - Session caching (cookies + localStorage + headers)
 * - Automatic session reuse between tests
 * - Token refresh and TTL handling
 * - Role switching within tests
 * - Parallel-safe and worker-isolated
 * - Typed access via sessions.get('role')
 * - Configurable via options and environment variables
 * 
 * @example
 * ```typescript
 * import { sessionsFixture } from 'playwright-forge';
 * 
 * const test = sessionsFixture.use({
 *   sessionsConfig: {
 *     roles: {
 *       admin: {
 *         apiLoginEndpoint: 'https://api.example.com/login',
 *         credentials: { username: 'admin', password: 'admin123' },
 *         ttl: 3600000, // 1 hour
 *       },
 *       user: {
 *         loginUrl: 'https://example.com/login',
 *         credentials: { username: 'user', password: 'user123' },
 *       },
 *     },
 *   },
 * });
 * 
 * test('admin vs user access', async ({ sessions }) => {
 *   const admin = await sessions.get('admin');
 *   const user = await sessions.get('user');
 *   
 *   await admin.page.goto('/admin');
 *   await user.page.goto('/profile');
 * });
 * ```
 */
export const sessionsFixture = base.extend<
  {},
  { sessionsConfig: SessionsConfig; sessions: SessionsManager }
>({
  sessionsConfig: [
    getSessionsConfig(),
    { scope: 'worker', option: true },
  ],
  
  sessions: [
    async ({ browser, playwright, sessionsConfig }, use) => {
      const manager = new SessionManager(sessionsConfig, browser, playwright);
      
      await use(manager);
      
      // Cleanup all sessions
      await manager.clearAll();
    },
    { scope: 'worker' },
  ],
});

// Export types
export type { SessionsConfig as SessionsOptions };
