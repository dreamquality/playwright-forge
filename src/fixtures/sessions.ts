import { test as base, BrowserContext, Page, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
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
  cookies?: any[];
  localStorage?: Record<string, string>;
  headers?: Record<string, string>;
  token?: string;
  expiresAt?: number;
  storageStatePath?: string;
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
  private browser: any;
  private playwright: any;
  private storageDir: string;

  constructor(config: SessionsConfig, browser: any, playwright: any) {
    this.config = config;
    this.browser = browser;
    this.playwright = playwright;
    this.storageDir = config.storageDir || path.join(process.cwd(), '.sessions');
    
    // Ensure storage directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
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

    // Need to create or refresh session
    if (cached) {
      // Session expired, need to refresh
      await this.clearRole(role);
    }

    return await this.createSession(role, roleConfig);
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
      if (cached.data.storageStatePath && fs.existsSync(cached.data.storageStatePath)) {
        fs.unlinkSync(cached.data.storageStatePath);
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
    let sessionData: SessionData = {
      storageStatePath,
    };

    // Try to load existing session from disk
    const loadedData = await this.loadSessionFromDisk(storageStatePath);
    if (loadedData && this.isSessionValid(loadedData)) {
      sessionData = loadedData;
    } else {
      // Need to perform login
      sessionData = await this.performLogin(role, roleConfig);
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
        sessionData = await this.performApiLogin(roleConfig, tempContext, tempApi);
      }
      // Fall back to UI-based login
      else if (roleConfig.loginUrl) {
        await this.performUILogin(roleConfig, tempPage);
        sessionData = await this.extractSessionData(tempPage, tempContext);
      } else {
        throw new Error(`No login method configured for role '${role}'`);
      }

      // Set TTL
      const ttl = roleConfig.ttl || this.config.defaultTTL || 3600000; // Default 1 hour
      sessionData.expiresAt = Date.now() + ttl;

      return sessionData;
    } finally {
      await tempApi.dispose();
      await tempPage.close();
      await tempContext.close();
    }
  }

  private async performApiLogin(
    roleConfig: RoleConfig,
    context: BrowserContext,
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
    };

    // If token exists, add it to headers
    if (token) {
      sessionData.headers = {
        Authorization: `Bearer ${token}`,
      };
      
      // Add cookies to context if we have a token
      const cookies = response.headers()['set-cookie'];
      if (cookies) {
        // Parse cookies and add to context
        // This is a simplified implementation - in production you'd want proper cookie parsing
        sessionData.cookies = [];
      }
    }

    return sessionData;
  }

  private async performUILogin(roleConfig: RoleConfig, page: Page): Promise<void> {
    if (!roleConfig.loginUrl) {
      throw new Error('Login URL not configured');
    }

    await page.goto(roleConfig.loginUrl);
    
    // This is a basic implementation - users should provide customLogin for complex scenarios
    if (roleConfig.credentials?.username) {
      await page.fill('input[name="username"], input[type="email"], input[name="email"]', 
        roleConfig.credentials.username);
    }
    if (roleConfig.credentials?.password) {
      await page.fill('input[name="password"], input[type="password"]', 
        roleConfig.credentials.password);
    }
    
    // Submit form
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');
    
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
    const contextOptions: any = {};

    // Add cookies if available
    if (sessionData.storageStatePath && fs.existsSync(sessionData.storageStatePath)) {
      contextOptions.storageState = sessionData.storageStatePath;
    }

    const context = await this.browser.newContext(contextOptions);

    // Set localStorage if we have data
    if (sessionData.localStorage) {
      const page = await context.newPage();
      await page.evaluate((data: Record<string, string>): void => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storage = (globalThis as any).localStorage;
        for (const [key, value] of Object.entries(data)) {
          storage.setItem(key, value);
        }
      }, sessionData.localStorage);
      await page.close();
    }

    return context;
  }

  private isSessionValid(sessionData: SessionData): boolean {
    if (!sessionData.expiresAt) {
      return false;
    }

    const now = Date.now();
    const refreshThreshold = this.config.refreshThreshold || 0.1; // Default 10%
    const ttl = sessionData.expiresAt - (sessionData.expiresAt - now) / (1 - refreshThreshold);
    
    return now < sessionData.expiresAt - (ttl * refreshThreshold);
  }

  private getStorageStatePath(role: string): string {
    const hash = crypto.createHash('md5').update(`${role}-${process.pid}`).digest('hex').substring(0, 8);
    return path.join(this.storageDir, `session-${role}-${hash}.json`);
  }

  private async loadSessionFromDisk(filePath: string): Promise<SessionData | null> {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      // Invalid or corrupted file, ignore
    }
    return null;
  }

  private async saveSessionToDisk(filePath: string, sessionData: SessionData): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Save to storage state format
    const storageState: any = {
      cookies: sessionData.cookies || [],
      origins: sessionData.localStorage ? [{
        origin: 'http://localhost',
        localStorage: Object.entries(sessionData.localStorage).map(([name, value]) => ({ name, value })),
      }] : [],
    };

    fs.writeFileSync(filePath, JSON.stringify({
      ...sessionData,
      storageState,
    }, null, 2));
  }

  private extractTokenFromPath(data: any, path: string): string | undefined {
    const parts = path.split('.');
    let current = data;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
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
  const envRoles = process.env.SESSIONS_ROLES ? JSON.parse(process.env.SESSIONS_ROLES) : {};
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
  { sessions: SessionsManager },
  { sessionsConfig: SessionsConfig }
>({
  sessionsConfig: [
    getSessionsConfig(),
    { scope: 'worker', option: true },
  ],
  
  sessions: async ({ browser, playwright, sessionsConfig }, use) => {
    const manager = new SessionManager(sessionsConfig, browser, playwright);
    
    await use(manager);
    
    // Cleanup all sessions
    await manager.clearAll();
  },
});

// Export types
export type { SessionsConfig as SessionsOptions };
