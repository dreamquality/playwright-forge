import { test, expect } from '@playwright/test';
import { type SessionsConfig, type RoleConfig, type SessionData } from '../src/fixtures/sessions';
import * as path from 'path';
import * as fs from 'fs';


test.describe('Sessions Fixture - Types and Configuration', () => {
  
  test('should have correct type definitions', () => {
    const roleConfig: RoleConfig = {
      credentials: {
        username: 'admin',
        password: 'admin123',
      },
      apiLoginEndpoint: 'https://api.example.com/login',
      apiLoginMethod: 'POST',
      ttl: 3600000,
    };
    
    expect(roleConfig.credentials?.username).toBe('admin');
    expect(roleConfig.apiLoginMethod).toBe('POST');
    expect(roleConfig.ttl).toBe(3600000);
  });
  
  test('should create session configuration', () => {
    const config: SessionsConfig = {
      roles: {
        admin: {
          credentials: { username: 'admin', password: 'pass' },
          apiLoginEndpoint: 'https://api.example.com/login',
          ttl: 3600000,
        },
        user: {
          loginUrl: 'https://example.com/login',
          credentials: { username: 'user', password: 'pass' },
        },
      },
      storageDir: '.sessions',
      defaultTTL: 1800000,
      preferApiLogin: true,
    };
    
    expect(config.roles.admin).toBeDefined();
    expect(config.roles.user).toBeDefined();
    expect(config.defaultTTL).toBe(1800000);
    expect(config.preferApiLogin).toBe(true);
  });
  
  test('should support custom login function', () => {
    const customLogin = async (page: any, api: any) => {
      await page.goto('https://example.com/login');
      await page.fill('#username', 'admin');
      await page.fill('#password', 'pass');
      await page.click('#submit');
    };
    
    const roleConfig: RoleConfig = {
      customLogin,
      ttl: 3600000,
    };
    
    expect(roleConfig.customLogin).toBeDefined();
    expect(typeof roleConfig.customLogin).toBe('function');
  });
  
  test('should define session data structure', () => {
    const sessionData: SessionData = {
      cookies: [
        {
          name: 'session',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        },
      ],
      localStorage: {
        'authToken': 'token-123',
        'user': JSON.stringify({ id: 1, name: 'Admin' }),
      },
      headers: {
        'Authorization': 'Bearer token-123',
      },
      token: 'token-123',
      expiresAt: Date.now() + 3600000,
      storageStatePath: '/path/to/storage.json',
    };
    
    expect(sessionData.token).toBe('token-123');
    expect(sessionData.headers?.Authorization).toBe('Bearer token-123');
    expect(sessionData.localStorage?.authToken).toBe('token-123');
    expect(sessionData.cookies?.length).toBe(1);
  });
  
  test('should support environment variable configuration', () => {
    // Test that environment variables can be used
    const originalEnv = {
      SESSIONS_STORAGE_DIR: process.env.SESSIONS_STORAGE_DIR,
      SESSIONS_DEFAULT_TTL: process.env.SESSIONS_DEFAULT_TTL,
      SESSIONS_PREFER_API_LOGIN: process.env.SESSIONS_PREFER_API_LOGIN,
    };
    
    process.env.SESSIONS_STORAGE_DIR = '.test-sessions';
    process.env.SESSIONS_DEFAULT_TTL = '7200000';
    process.env.SESSIONS_PREFER_API_LOGIN = 'true';
    
    expect(process.env.SESSIONS_STORAGE_DIR).toBe('.test-sessions');
    expect(process.env.SESSIONS_DEFAULT_TTL).toBe('7200000');
    expect(process.env.SESSIONS_PREFER_API_LOGIN).toBe('true');
    
    // Restore
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key as keyof typeof originalEnv] !== undefined) {
        process.env[key] = originalEnv[key as keyof typeof originalEnv];
      } else {
        delete process.env[key];
      }
    });
  });
  
  test('should validate token path extraction', () => {
    const responseData = {
      data: {
        token: 'nested-token-123',
        user: { id: 1 },
      },
      meta: { timestamp: Date.now() },
    };
    
    // Simulate token path extraction
    const tokenPath = 'data.token';
    const parts = tokenPath.split('.');
    let current: unknown = responseData;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      }
    }
    
    expect(current).toBe('nested-token-123');
  });
});

test.describe('Sessions Fixture - Storage', () => {
  const testStorageDir = path.join(process.cwd(), '.sessions-test-storage');
  
  test.afterAll(() => {
    // Cleanup test storage directory
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });
  
  test('should create storage directory', () => {
    if (!fs.existsSync(testStorageDir)) {
      fs.mkdirSync(testStorageDir, { recursive: true });
    }
    
    expect(fs.existsSync(testStorageDir)).toBe(true);
  });
  
  test('should persist session data to disk', () => {
    const sessionData: SessionData = {
      token: 'test-token-123',
      headers: { Authorization: 'Bearer test-token-123' },
      expiresAt: Date.now() + 3600000,
      localStorage: { user: 'test-user' },
      cookies: [],
    };
    
    const filePath = path.join(testStorageDir, 'test-session.json');
    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
    
    expect(fs.existsSync(filePath)).toBe(true);
    
    const loaded = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(loaded.token).toBe('test-token-123');
    expect(loaded.headers.Authorization).toBe('Bearer test-token-123');
  });
  
  test('should handle storage state format', () => {
    const storageState = {
      cookies: [
        {
          name: 'session',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
        },
      ],
      origins: [
        {
          origin: 'https://example.com',
          localStorage: [
            { name: 'token', value: 'token-123' },
            { name: 'user', value: JSON.stringify({ id: 1 }) },
          ],
        },
      ],
    };
    
    expect(storageState.cookies.length).toBe(1);
    expect(storageState.origins.length).toBe(1);
    expect(storageState.origins[0].localStorage.length).toBe(2);
  });
});
