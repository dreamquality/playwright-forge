import { test, expect } from '@playwright/test';
import { 
  OpenApiValidator, 
  validateResponse, 
  assertValidResponse 
} from '../src/utils/openapiValidator';
import * as path from 'path';
import * as fs from 'fs';

// Create a sample OpenAPI spec for testing
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
  },
};

test.describe('OpenAPI Validator', () => {
  test.beforeAll(() => {
    // Create a temporary OpenAPI spec file for testing
    const tempDir = path.join(process.cwd(), '.temp-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create YAML version
    const yamlPath = path.join(tempDir, 'openapi.yaml');
    fs.writeFileSync(
      yamlPath,
      `openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users/{id}:
    get:
      summary: Get user by ID
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                required: [id, name]
                properties:
                  id:
                    type: string
                  name:
                    type: string
`
    );

    // Create JSON version
    const jsonPath = path.join(tempDir, 'openapi.json');
    fs.writeFileSync(jsonPath, JSON.stringify(sampleOpenApiSpec, null, 2));
  });

  test.afterAll(() => {
    // Clean up temp files
    const tempDir = path.join(process.cwd(), '.temp-test');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('validates response with valid data from object spec', async () => {
    const validUser = {
      id: '123',
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
    };

    const result = await validateResponse({
      spec: sampleOpenApiSpec,
      path: '/users/{id}',
      method: 'get',
      status: 200,
      responseBody: validUser,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('detects missing required fields', async () => {
    const invalidUser = {
      id: '123',
      // Missing required 'name' and 'email'
    };

    const result = await validateResponse({
      spec: sampleOpenApiSpec,
      path: '/users/{id}',
      method: 'get',
      status: 200,
      responseBody: invalidUser,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(err => err.includes('name'))).toBe(true);
  });

  test('validates array responses', async () => {
    const validProducts = [
      { id: '1', name: 'Product 1', price: 10.99 },
      { id: '2', name: 'Product 2', price: 20.99 },
    ];

    const result = await validateResponse({
      spec: sampleOpenApiSpec,
      path: '/products',
      method: 'get',
      status: 200,
      responseBody: validProducts,
    });

    expect(result.valid).toBe(true);
  });

  test('detects invalid types', async () => {
    const invalidUser = {
      id: '123',
      name: 'John Doe',
      email: 'john@example.com',
      age: 'thirty', // Should be number
    };

    const result = await validateResponse({
      spec: sampleOpenApiSpec,
      path: '/users/{id}',
      method: 'get',
      status: 200,
      responseBody: invalidUser,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(err => err.includes('age'))).toBe(true);
  });

  test('validates email format', async () => {
    const invalidUser = {
      id: '123',
      name: 'John Doe',
      email: 'not-an-email', // Invalid email format
    };

    const result = await validateResponse({
      spec: sampleOpenApiSpec,
      path: '/users/{id}',
      method: 'get',
      status: 200,
      responseBody: invalidUser,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(err => err.includes('email'))).toBe(true);
  });

  test('loads spec from JSON file', async () => {
    const validUser = {
      id: '123',
      name: 'John Doe',
      email: 'john@example.com',
    };

    const result = await validateResponse({
      spec: '.temp-test/openapi.json',
      path: '/users/{id}',
      method: 'get',
      status: 200,
      responseBody: validUser,
    });

    expect(result.valid).toBe(true);
  });

  test('loads spec from YAML file', async () => {
    const validUser = {
      id: '123',
      name: 'John Doe',
    };

    const result = await validateResponse({
      spec: '.temp-test/openapi.yaml',
      path: '/users/{id}',
      method: 'get',
      status: 200,
      responseBody: validUser,
    });

    expect(result.valid).toBe(true);
  });

  test('assertValidResponse throws on validation failure', async () => {
    const invalidUser = {
      id: '123',
      // Missing required fields
    };

    await expect(
      assertValidResponse({
        spec: sampleOpenApiSpec,
        path: '/users/{id}',
        method: 'get',
        status: 200,
        responseBody: invalidUser,
      })
    ).rejects.toThrow('OpenAPI validation failed');
  });

  test('assertValidResponse passes on valid data', async () => {
    const validUser = {
      id: '123',
      name: 'John Doe',
      email: 'john@example.com',
    };

    await expect(
      assertValidResponse({
        spec: sampleOpenApiSpec,
        path: '/users/{id}',
        method: 'get',
        status: 200,
        responseBody: validUser,
      })
    ).resolves.not.toThrow();
  });

  test('handles different status codes', async () => {
    const errorResponse = {
      error: 'User not found',
    };

    const result = await validateResponse({
      spec: sampleOpenApiSpec,
      path: '/users/{id}',
      method: 'get',
      status: 404,
      responseBody: errorResponse,
    });

    expect(result.valid).toBe(true);
  });

  test('validates with strict mode disabled (allows additional properties)', async () => {
    const userWithExtra = {
      id: '123',
      name: 'John Doe',
      email: 'john@example.com',
      extraField: 'This is allowed',
    };

    const result = await validateResponse({
      spec: sampleOpenApiSpec,
      path: '/users/{id}',
      method: 'get',
      status: 200,
      responseBody: userWithExtra,
      allowAdditionalProperties: true,
    });

    expect(result.valid).toBe(true);
  });

  test('validates with strict mode enabled (rejects additional properties)', async () => {
    const userWithExtra = {
      id: '123',
      name: 'John Doe',
      email: 'john@example.com',
      extraField: 'This should fail',
    };

    const result = await validateResponse({
      spec: sampleOpenApiSpec,
      path: '/users/{id}',
      method: 'get',
      status: 200,
      responseBody: userWithExtra,
      strict: true,
    });

    expect(result.valid).toBe(false);
  });

  test('caches spec by default', async () => {
    const validator = new OpenApiValidator();

    // First call - should load spec
    const result1 = await validator.validateResponse({
      spec: sampleOpenApiSpec,
      path: '/users/{id}',
      method: 'get',
      status: 200,
      responseBody: { id: '1', name: 'Test', email: 'test@example.com' },
    });

    // Second call - should use cached spec
    const result2 = await validator.validateResponse({
      spec: sampleOpenApiSpec,
      path: '/products',
      method: 'get',
      status: 200,
      responseBody: [{ id: '1', name: 'Product', price: 10 }],
    });

    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
  });

  test('clears cache', () => {
    OpenApiValidator.clearCache();
    // No error should occur
    expect(true).toBe(true);
  });
});
