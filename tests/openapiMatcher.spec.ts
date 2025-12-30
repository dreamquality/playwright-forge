import { test, expect } from '@playwright/test';
import { 
  OpenApiMatcher, 
  expectApiResponse 
} from '../src/utils/openapiMatcher';
import type { APIResponse } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Sample OpenAPI spec for testing
const sampleOpenApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Test API',
    version: '1.0.0',
  },
  paths: {
    '/users/{id}': {
      get: {
        summary: 'Get user by ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'name', 'email'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    age: { type: 'number' },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          '404': {
            description: 'User not found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/products': {
      get: {
        summary: 'List products',
        responses: {
          '200': {
            description: 'List of products',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['id', 'name', 'price'],
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      price: { type: 'number', minimum: 0 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/orders/{orderId}': {
      get: {
        summary: 'Get order',
        responses: {
          '200': {
            description: 'Order found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['orderId', 'total'],
                  properties: {
                    orderId: { type: 'string' },
                    total: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// Helper function to create a mock APIResponse
function createMockResponse(url: string, status: number, body: any): APIResponse {
  return {
    url: () => url,
    status: () => status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: () => ({}),
    ok: () => status >= 200 && status < 300,
  } as any as APIResponse;
}

test.describe('OpenAPI Matcher', () => {
  test.beforeAll(() => {
    // Create a temporary OpenAPI spec file
    const tempDir = path.join(process.cwd(), '.temp-test-matcher');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const jsonPath = path.join(tempDir, 'openapi-matcher.json');
    fs.writeFileSync(jsonPath, JSON.stringify(sampleOpenApiSpec, null, 2));
  });

  test.afterAll(() => {
    // Clean up temp files
    const tempDir = path.join(process.cwd(), '.temp-test-matcher');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    // Clear cache
    OpenApiMatcher.clearCache();
  });

  test('one-liner API validates response automatically', async () => {
    const mockResponse = createMockResponse(
      'https://api.example.com/users/123',
      200,
      {
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      }
    );
    
    // Use the one-liner API with manual overrides
    const result = await expectApiResponse(mockResponse).toMatchOpenApiSchema({
      spec: sampleOpenApiSpec,
      method: 'get',
      path: '/users/123',
      status: 200,
    });

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('message');
    expect(result.valid).toBe(true);
  });

  test('matcher auto-detects path with parameters', async () => {
    const matcher = new OpenApiMatcher();
    
    const mockResponse = createMockResponse(
      'https://api.example.com/users/456',
      200,
      {
        id: '456',
        name: 'Jane Doe',
        email: 'jane@example.com',
      }
    );

    const result = await matcher.validateResponse(mockResponse, sampleOpenApiSpec, {
      method: 'get',
      path: '/users/456',
      status: 200,
    });

    // Should find matching path template
    expect(result).toHaveProperty('valid');
    expect(result.valid).toBe(true);
  });

  test('matcher detects validation errors', async () => {
    const matcher = new OpenApiMatcher();
    
    const mockResponse = createMockResponse(
      'https://api.example.com/users/123',
      200,
      {
        id: '123',
        // Missing required 'name' and 'email' fields
      }
    );

    const result = await matcher.validateResponse(mockResponse, sampleOpenApiSpec, {
      method: 'get',
      path: '/users/123',
      status: 200,
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain('validation failed');
  });

  test('matcher handles array responses', async () => {
    const matcher = new OpenApiMatcher();
    
    const mockResponse = createMockResponse(
      'https://api.example.com/products',
      200,
      [
        { id: '1', name: 'Product 1', price: 10.99 },
        { id: '2', name: 'Product 2', price: 20.99 },
      ]
    );

    const result = await matcher.validateResponse(mockResponse, sampleOpenApiSpec, {
      method: 'get',
      path: '/products',
      status: 200,
    });

    expect(result.valid).toBe(true);
  });

  test('matcher handles cache with TTL', async () => {
    const matcher = new OpenApiMatcher({ cacheTTL: 1000 }); // 1 second TTL
    
    const mockResponse = createMockResponse(
      'https://api.example.com/users/1',
      200,
      { id: '1', name: 'Test', email: 'test@example.com' }
    );

    // First call - should cache (using file path so it can be cached)
    await matcher.validateResponse(mockResponse, '.temp-test-matcher/openapi-matcher.json', {
      method: 'get',
      path: '/users/1',
      status: 200,
    });

    const cacheSize1 = OpenApiMatcher.getCacheSize();
    expect(cacheSize1).toBeGreaterThan(0);

    // Second call - should use cache
    await matcher.validateResponse(mockResponse, '.temp-test-matcher/openapi-matcher.json', {
      method: 'get',
      path: '/users/1',
      status: 200,
    });

    const cacheSize2 = OpenApiMatcher.getCacheSize();
    expect(cacheSize2).toBe(cacheSize1);
  });

  test('matcher can disable caching', async () => {
    OpenApiMatcher.clearCache();
    
    const matcher = new OpenApiMatcher({ enableCache: false });
    
    const mockResponse = createMockResponse(
      'https://api.example.com/users/1',
      200,
      { id: '1', name: 'Test', email: 'test@example.com' }
    );

    await matcher.validateResponse(mockResponse, sampleOpenApiSpec, {
      method: 'get',
      path: '/users/1',
      status: 200,
    });

    // Cache should still be empty
    expect(OpenApiMatcher.getCacheSize()).toBe(0);
  });

  test('matcher loads spec from file', async () => {
    const matcher = new OpenApiMatcher();
    
    const mockResponse = createMockResponse(
      'https://api.example.com/users/1',
      200,
      { id: '1', name: 'Test', email: 'test@example.com' }
    );

    const result = await matcher.validateResponse(
      mockResponse,
      '.temp-test-matcher/openapi-matcher.json',
      {
        method: 'get',
        path: '/users/1',
        status: 200,
      }
    );

    expect(result).toHaveProperty('valid');
    expect(result.valid).toBe(true);
  });

  test('matcher supports strict mode', async () => {
    const strictMatcher = new OpenApiMatcher({ strict: true });
    
    // Response with extra field
    const mockResponse = createMockResponse(
      'https://api.example.com/users/1',
      200,
      { 
        id: '1', 
        name: 'Test', 
        email: 'test@example.com',
        extraField: 'not in schema' 
      }
    );

    const strictResult = await strictMatcher.validateResponse(mockResponse, sampleOpenApiSpec, {
      method: 'get',
      path: '/users/1',
      status: 200,
    });

    // Strict mode should reject extra fields
    expect(strictResult.valid).toBe(false);
  });

  test('matcher supports custom path resolver', async () => {
    let resolverCalled = false;
    const customResolver = (templatePath: string, actualPath: string) => {
      resolverCalled = true;
      // Custom logic
      return templatePath.replace(/{[^}]+}/g, '[^/]+').match(new RegExp(actualPath.replace(/\//g, '\\/'))) !== null;
    };

    const matcher = new OpenApiMatcher({ pathResolver: customResolver });
    
    const mockResponse = createMockResponse(
      'https://api.example.com/users/1',
      200,
      { id: '1', name: 'Test', email: 'test@example.com' }
    );

    await matcher.validateResponse(mockResponse, sampleOpenApiSpec, {
      method: 'get',
      path: '/users/1',
      status: 200,
    });

    expect(resolverCalled).toBe(true);
  });

  test('matcher supports custom error formatter', async () => {
    const customFormatter = (errors: any[], context: any) => {
      return `Custom error for ${context.method} ${context.path}`;
    };

    const matcher = new OpenApiMatcher({ errorFormatter: customFormatter });
    
    const mockResponse = createMockResponse(
      'https://api.example.com/users/1',
      200,
      { id: '1' } // Missing required fields
    );

    const result = await matcher.validateResponse(mockResponse, sampleOpenApiSpec, {
      method: 'get',
      path: '/users/1',
      status: 200,
    });

    // Should use custom formatter
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Custom error');
  });

  test('matcher clears cache manually', () => {
    OpenApiMatcher.clearCache();
    expect(OpenApiMatcher.getCacheSize()).toBe(0);
  });

  test('matcher path matching works with nested paths', async () => {
    const matcher = new OpenApiMatcher();
    
    const mockResponse = createMockResponse(
      'https://api.example.com/api/v1/orders/12345',
      200,
      { orderId: '12345', total: 99.99 }
    );

    const result = await matcher.validateResponse(mockResponse, sampleOpenApiSpec, {
      method: 'get',
      path: '/api/v1/orders/12345',
      status: 200,
    });

    // Should find the matching path template
    expect(result.valid).toBe(true);
  });

  test('matcher provides detailed context in result', async () => {
    const matcher = new OpenApiMatcher();
    
    const mockResponse = createMockResponse(
      'https://api.example.com/users/1',
      200,
      { id: '1', name: 'Test', email: 'test@example.com' }
    );

    const result = await matcher.validateResponse(mockResponse, sampleOpenApiSpec, {
      method: 'get',
      path: '/users/1',
      status: 200,
    });

    expect(result).toHaveProperty('message');
    if (result.context) {
      expect(result.context).toHaveProperty('method');
      expect(result.context).toHaveProperty('path');
      expect(result.context).toHaveProperty('status');
      expect(result.context).toHaveProperty('schema');
    }
  });
});
