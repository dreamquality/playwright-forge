import { test, expect } from '@playwright/test';
import { OpenApiErrorFormatter, ValidationContext } from '../src/utils/openapiErrorFormatter';
import { ErrorObject } from 'ajv';

test.describe('OpenAPI Error Formatter', () => {
  test('should format validation errors in detailed mode', () => {
    const formatter = new OpenApiErrorFormatter({
      errorFormat: 'detailed',
      showSchemaSnippet: true,
    });

    const errors: ErrorObject[] = [
      {
        keyword: 'type',
        instancePath: '/user/email',
        schemaPath: '#/properties/user/properties/email/type',
        params: { type: 'string' },
        message: 'must be string',
        data: 12345,
      },
      {
        keyword: 'required',
        instancePath: '/user',
        schemaPath: '#/properties/user/required',
        params: { missingProperty: 'name' },
        message: 'must have required property "name"',
        data: { email: 'test@example.com' },
      },
    ];

    const context: ValidationContext = {
      method: 'POST',
      resolvedPath: '/users',
      actualUrl: 'https://api.example.com/users',
      status: 400,
      contentType: 'application/json',
      validationMode: 'strict',
      schema: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
            required: ['name', 'email'],
          },
        },
      },
    };

    const formatted = formatter.format(errors, context);

    expect(formatted).toContain('OpenAPI Validation Failed');
    expect(formatted).toContain('Method:       POST');
    expect(formatted).toContain('Path:         /users');
    expect(formatted).toContain('URL:          https://api.example.com/users');
    expect(formatted).toContain('Status:       400');
    expect(formatted).toContain('Content-Type: application/json');
    expect(formatted).toContain('Total Errors: 2');
    expect(formatted).toContain('Mode:         strict');
    expect(formatted).toContain('$.user.email');
    expect(formatted).toContain('Expected:    type: string');
    expect(formatted).toContain('$.user');
    expect(formatted).toContain('Missing required property "name"');
    expect(formatted).toContain('Schema Context:');
  });

  test('should format validation errors in short mode', () => {
    const formatter = new OpenApiErrorFormatter({
      errorFormat: 'short',
      showSchemaSnippet: false,
    });

    const errors: ErrorObject[] = [
      {
        keyword: 'type',
        instancePath: '/email',
        schemaPath: '#/properties/email/type',
        params: { type: 'string' },
        message: 'must be string',
        data: 12345,
      },
    ];

    const context: ValidationContext = {
      method: 'GET',
      resolvedPath: '/users/{id}',
      status: 200,
    };

    const formatted = formatter.format(errors, context);

    expect(formatted).toContain('1. $.email:');
    expect(formatted).toContain('Expected string but got number');
    expect(formatted).not.toContain('Schema Context:');
  });

  test('should redact sensitive fields', () => {
    const formatter = new OpenApiErrorFormatter({
      redactFields: ['password', 'token', 'apiKey'],
    });

    const errors: ErrorObject[] = [
      {
        keyword: 'minLength',
        instancePath: '/password',
        schemaPath: '#/properties/password/minLength',
        params: { limit: 8 },
        message: 'must NOT have fewer than 8 characters',
        data: 'short',
      },
    ];

    const context: ValidationContext = {
      method: 'POST',
      resolvedPath: '/auth/login',
      status: 400,
    };

    const formatted = formatter.format(errors, context);

    expect(formatted).toContain('$.password');
    expect(formatted).toContain('[REDACTED]');
    expect(formatted).not.toContain('short');
  });

  test('should limit number of errors displayed', () => {
    const formatter = new OpenApiErrorFormatter({
      maxErrors: 2,
    });

    const errors: ErrorObject[] = [
      {
        keyword: 'type',
        instancePath: '/field1',
        schemaPath: '#/properties/field1/type',
        params: { type: 'string' },
        message: 'must be string',
        data: 123,
      },
      {
        keyword: 'type',
        instancePath: '/field2',
        schemaPath: '#/properties/field2/type',
        params: { type: 'string' },
        message: 'must be string',
        data: 456,
      },
      {
        keyword: 'type',
        instancePath: '/field3',
        schemaPath: '#/properties/field3/type',
        params: { type: 'string' },
        message: 'must be string',
        data: 789,
      },
    ];

    const context: ValidationContext = {
      method: 'POST',
      resolvedPath: '/data',
      status: 400,
    };

    const formatted = formatter.format(errors, context);

    expect(formatted).toContain('Total Errors: 3');
    expect(formatted).toContain('Showing:      2');
    expect(formatted).toContain('... and 1 more error(s)');
    expect(formatted).toContain('$.field1');
    expect(formatted).toContain('$.field2');
    expect(formatted).not.toContain('$.field3');
  });

  test('should show raw AJV errors in debug mode', () => {
    const formatter = new OpenApiErrorFormatter({
      debugRawErrors: true,
    });

    const errors: ErrorObject[] = [
      {
        keyword: 'type',
        instancePath: '/value',
        schemaPath: '#/properties/value/type',
        params: { type: 'number' },
        message: 'must be number',
        data: 'abc',
      },
    ];

    const context: ValidationContext = {
      method: 'PUT',
      resolvedPath: '/config',
      status: 400,
    };

    const formatted = formatter.format(errors, context);

    expect(formatted).toContain('Raw AJV Errors (debug):');
    expect(formatted).toContain('"keyword": "type"');
    expect(formatted).toContain('"instancePath": "/value"');
  });

  test('should handle enum validation errors', () => {
    const formatter = new OpenApiErrorFormatter();

    const errors: ErrorObject[] = [
      {
        keyword: 'enum',
        instancePath: '/status',
        schemaPath: '#/properties/status/enum',
        params: { allowedValues: ['active', 'inactive', 'pending'] },
        message: 'must be equal to one of the allowed values',
        data: 'invalid',
      },
    ];

    const context: ValidationContext = {
      method: 'PATCH',
      resolvedPath: '/users/{id}',
      status: 400,
    };

    const formatted = formatter.format(errors, context);

    expect(formatted).toContain('$.status');
    expect(formatted).toContain('one of: active, inactive, pending');
    expect(formatted).toContain('Value must be one of: active, inactive, pending');
  });

  test('should handle format validation errors', () => {
    const formatter = new OpenApiErrorFormatter();

    const errors: ErrorObject[] = [
      {
        keyword: 'format',
        instancePath: '/email',
        schemaPath: '#/properties/email/format',
        params: { format: 'email' },
        message: 'must match format "email"',
        data: 'not-an-email',
      },
    ];

    const context: ValidationContext = {
      method: 'POST',
      resolvedPath: '/users',
      status: 400,
    };

    const formatted = formatter.format(errors, context);

    expect(formatted).toContain('$.email');
    expect(formatted).toContain('format: email');
    expect(formatted).toContain('String must be valid email format');
  });

  test('should handle additionalProperties validation errors', () => {
    const formatter = new OpenApiErrorFormatter();

    const errors: ErrorObject[] = [
      {
        keyword: 'additionalProperties',
        instancePath: '/data',
        schemaPath: '#/properties/data/additionalProperties',
        params: { additionalProperty: 'extraField' },
        message: 'must NOT have additional properties',
        data: { name: 'John', extraField: 'value' },
      },
    ];

    const context: ValidationContext = {
      method: 'POST',
      resolvedPath: '/users',
      status: 400,
      validationMode: 'strict',
    };

    const formatted = formatter.format(errors, context);

    expect(formatted).toContain('$.data');
    expect(formatted).toContain('no additional properties allowed');
    expect(formatted).toContain('Property "extraField" is not allowed (strict mode)');
  });

  test('should handle array validation errors', () => {
    const formatter = new OpenApiErrorFormatter();

    const errors: ErrorObject[] = [
      {
        keyword: 'minItems',
        instancePath: '/items',
        schemaPath: '#/properties/items/minItems',
        params: { limit: 3 },
        message: 'must NOT have fewer than 3 items',
        data: [1, 2],
      },
    ];

    const context: ValidationContext = {
      method: 'POST',
      resolvedPath: '/orders',
      status: 400,
    };

    const formatted = formatter.format(errors, context);

    expect(formatted).toContain('$.items');
    expect(formatted).toContain('minimum items: 3');
    expect(formatted).toContain('Array must have at least 3 items');
  });

  test('should handle pattern validation errors', () => {
    const formatter = new OpenApiErrorFormatter();

    const errors: ErrorObject[] = [
      {
        keyword: 'pattern',
        instancePath: '/phoneNumber',
        schemaPath: '#/properties/phoneNumber/pattern',
        params: { pattern: '^\\+?[1-9]\\d{1,14}$' },
        message: 'must match pattern',
        data: 'invalid-phone',
      },
    ];

    const context: ValidationContext = {
      method: 'POST',
      resolvedPath: '/contacts',
      status: 400,
    };

    const formatted = formatter.format(errors, context);

    expect(formatted).toContain('$.phoneNumber');
    expect(formatted).toContain('pattern: ^\\+?[1-9]\\d{1,14}$');
    expect(formatted).toContain('String must match pattern');
  });
});
