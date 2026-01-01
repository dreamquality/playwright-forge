import { test, expect } from '@playwright/test';
import {
  DataFactory,
  validateJsonSchema,
  assertJsonSchema,
  softAssertions,
  poll,
  pollUntilValue,
  loadYaml,
  loadYamlAsync,
  saveYaml,
  FileAssertions,
  waitForDownload,
  faker
} from '../src';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test.describe('Edge Cases and Boundary Tests', () => {

  test.describe('DataFactory Edge Cases', () => {
    
    test('should generate consistent data with same seed', () => {
      DataFactory.seed(12345);
      const user1 = DataFactory.user();
      
      DataFactory.seed(12345);
      const user2 = DataFactory.user();
      
      expect(user1.email).toBe(user2.email);
      expect(user1.firstName).toBe(user2.firstName);
      expect(user1.lastName).toBe(user2.lastName);
    });

    test('should generate different data with different seeds', () => {
      DataFactory.seed(12345);
      const user1 = DataFactory.user();
      
      DataFactory.seed(67890);
      const user2 = DataFactory.user();
      
      expect(user1.email).not.toBe(user2.email);
    });

    test('should generate array with specified length', () => {
      const users = DataFactory.array(() => DataFactory.user(), 5);
      expect(users).toHaveLength(5);
      
      const emptyArray = DataFactory.array(() => DataFactory.user(), 0);
      expect(emptyArray).toHaveLength(0);
    });

    test('should handle large array generation', () => {
      const largeArray = DataFactory.array(() => DataFactory.user(), 1000);
      expect(largeArray).toHaveLength(1000);
      
      // Verify uniqueness
      const emails = largeArray.map(u => u.email);
      const uniqueEmails = new Set(emails);
      expect(uniqueEmails.size).toBeGreaterThan(950); // Allow some collisions but expect mostly unique
    });

    test('should generate valid product data', () => {
      const product = DataFactory.product();
      expect(product.name).toBeDefined();
      expect(product.price).toBeGreaterThan(0);
      expect(typeof product.price).toBe('number');
      expect(product.description).toBeDefined();
    });

    test('should generate valid company data', () => {
      const company = DataFactory.company();
      expect(company.name).toBeDefined();
      expect(company.catchPhrase).toBeDefined();
      expect(company.bs).toBeDefined();
    });

    test('should generate valid address data', () => {
      const address = DataFactory.address();
      expect(address.street).toBeDefined();
      expect(address.city).toBeDefined();
      expect(address.country).toBeDefined();
      expect(address.zipCode).toBeDefined();
    });

    test('should allow direct faker usage', () => {
      const customEmail = faker.internet.email();
      expect(customEmail).toContain('@');
      
      const customNumber = faker.number.int({ min: 1, max: 100 });
      expect(customNumber).toBeGreaterThanOrEqual(1);
      expect(customNumber).toBeLessThanOrEqual(100);
    });
  });

  test.describe('JSON Schema Edge Cases', () => {

    test('should validate nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              profile: {
                type: 'object',
                properties: {
                  age: { type: 'number' },
                  bio: { type: 'string' }
                },
                required: ['age']
              }
            },
            required: ['name', 'profile']
          }
        },
        required: ['user']
      };

      const validData = {
        user: {
          name: 'John',
          profile: {
            age: 30,
            bio: 'Test bio'
          }
        }
      };

      const result = validateJsonSchema(validData, schema);
      expect(result.valid).toBe(true);
    });

    test('should handle deeply nested missing required fields', () => {
      const schema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'object',
                    properties: {
                      required: { type: 'string' }
                    },
                    required: ['required']
                  }
                },
                required: ['level3']
              }
            },
            required: ['level2']
          }
        },
        required: ['level1']
      };

      const invalidData = {
        level1: {
          level2: {
            level3: {}
          }
        }
      };

      const result = validateJsonSchema(invalidData, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should validate arrays with items schema', () => {
      const schema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' }
              },
              required: ['id']
            }
          }
        }
      };

      const validData = {
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' }
        ]
      };

      const result = validateJsonSchema(validData, schema);
      expect(result.valid).toBe(true);
    });

    test('should detect invalid array items', () => {
      const schema = {
        type: 'array',
        items: { type: 'number' }
      };

      const invalidData = [1, 2, 'three', 4];
      const result = validateJsonSchema(invalidData, schema);
      expect(result.valid).toBe(false);
    });

    test('should handle empty arrays', () => {
      const schema = {
        type: 'array',
        items: { type: 'string' }
      };

      const emptyArray: string[] = [];
      const result = validateJsonSchema(emptyArray, schema);
      expect(result.valid).toBe(true);
    });

    test('should validate array with minItems and maxItems', () => {
      const schema = {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 5
      };

      expect(validateJsonSchema(['a'], schema).valid).toBe(false); // Too few
      expect(validateJsonSchema(['a', 'b'], schema).valid).toBe(true); // Min
      expect(validateJsonSchema(['a', 'b', 'c'], schema).valid).toBe(true); // Middle
      expect(validateJsonSchema(['a', 'b', 'c', 'd', 'e'], schema).valid).toBe(true); // Max
      expect(validateJsonSchema(['a', 'b', 'c', 'd', 'e', 'f'], schema).valid).toBe(false); // Too many
    });

    test('should handle string formats', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          date: { type: 'string', format: 'date' },
          dateTime: { type: 'string', format: 'date-time' },
          uri: { type: 'string', format: 'uri' }
        }
      };

      const validData = {
        email: 'test@example.com',
        date: '2024-01-01',
        dateTime: '2024-01-01T12:00:00Z',
        uri: 'https://example.com'
      };

      const result = validateJsonSchema(validData, schema);
      expect(result.valid).toBe(true);

      const invalidData = {
        email: 'not-an-email',
        date: 'not-a-date',
        dateTime: 'not-a-datetime',
        uri: 'not-a-uri'
      };

      const result2 = validateJsonSchema(invalidData, schema);
      expect(result2.valid).toBe(false);
    });

    test('should handle number constraints', () => {
      const schema = {
        type: 'object',
        properties: {
          age: { type: 'number', minimum: 0, maximum: 150 },
          score: { type: 'number', multipleOf: 5 }
        }
      };

      expect(validateJsonSchema({ age: 25, score: 50 }, schema).valid).toBe(true);
      expect(validateJsonSchema({ age: -1, score: 50 }, schema).valid).toBe(false); // Below minimum
      expect(validateJsonSchema({ age: 200, score: 50 }, schema).valid).toBe(false); // Above maximum
      expect(validateJsonSchema({ age: 25, score: 51 }, schema).valid).toBe(false); // Not multiple of 5
    });

    test('should handle string constraints', () => {
      const schema = {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 20 },
          code: { type: 'string', pattern: '^[A-Z]{3}\\d{3}$' }
        }
      };

      expect(validateJsonSchema({ username: 'john', code: 'ABC123' }, schema).valid).toBe(true);
      expect(validateJsonSchema({ username: 'ab', code: 'ABC123' }, schema).valid).toBe(false); // Too short
      expect(validateJsonSchema({ username: 'a'.repeat(21), code: 'ABC123' }, schema).valid).toBe(false); // Too long
      expect(validateJsonSchema({ username: 'john', code: 'abc123' }, schema).valid).toBe(false); // Wrong pattern
    });

    test('should handle enum values', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive', 'pending'] }
        }
      };

      expect(validateJsonSchema({ status: 'active' }, schema).valid).toBe(true);
      expect(validateJsonSchema({ status: 'deleted' }, schema).valid).toBe(false);
    });

    test('should handle oneOf', () => {
      const schema = {
        oneOf: [
          { type: 'string' },
          { type: 'number' }
        ]
      };

      expect(validateJsonSchema('text', schema).valid).toBe(true);
      expect(validateJsonSchema(123, schema).valid).toBe(true);
      expect(validateJsonSchema(true, schema).valid).toBe(false);
    });

    test('should handle anyOf', () => {
      const schema = {
        anyOf: [
          { type: 'string', minLength: 5 },
          { type: 'number', minimum: 10 }
        ]
      };

      expect(validateJsonSchema('hello', schema).valid).toBe(true);
      expect(validateJsonSchema(15, schema).valid).toBe(true);
      expect(validateJsonSchema('hi', schema).valid).toBe(false);
      expect(validateJsonSchema(5, schema).valid).toBe(false);
    });

    test('should handle allOf', () => {
      const schema = {
        allOf: [
          { type: 'object', properties: { name: { type: 'string' } } },
          { type: 'object', properties: { age: { type: 'number' } } }
        ]
      };

      expect(validateJsonSchema({ name: 'John', age: 30 }, schema).valid).toBe(true);
      expect(validateJsonSchema({ name: 'John' }, schema).valid).toBe(true);
      expect(validateJsonSchema({ age: 30 }, schema).valid).toBe(true);
    });

    test('should handle null values', () => {
      const schema = {
        type: 'object',
        properties: {
          nullable: { type: ['string', 'null'] },
          required: { type: 'string' }
        },
        required: ['required']
      };

      expect(validateJsonSchema({ required: 'value', nullable: null }, schema).valid).toBe(true);
      expect(validateJsonSchema({ required: 'value', nullable: 'text' }, schema).valid).toBe(true);
    });
  });

  test.describe('Soft Assertions Edge Cases', () => {

    test('should collect multiple failures', async () => {
      const soft = softAssertions();

      await soft.assert(() => expect(1).toBe(2));
      await soft.assert(() => expect('a').toBe('b'));
      await soft.assert(() => expect(true).toBe(false));

      expect(() => soft.verify()).toThrow();
    });

    test('should not throw if all assertions pass', async () => {
      const soft = softAssertions();

      await soft.assert(() => expect(1).toBe(1));
      await soft.assert(() => expect('a').toBe('a'));
      await soft.assert(() => expect(true).toBe(true));

      expect(() => soft.verify()).not.toThrow();
    });

    test('should handle async assertions', async () => {
      const soft = softAssertions();

      await soft.assert(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(1).toBe(1);
      });

      await soft.assert(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(2).toBe(2);
      });

      expect(() => soft.verify()).not.toThrow();
    });

    test('should handle empty assertion set', () => {
      const soft = softAssertions();
      expect(() => soft.verify()).not.toThrow();
    });
  });

  test.describe('Polling Edge Cases', () => {

    test('should succeed immediately if condition is already true', async () => {
      let callCount = 0;
      
      await poll(
        async () => {
          callCount++;
          return true;
        },
        { interval: 100, timeout: 1000 }
      );

      expect(callCount).toBe(1);
    });

    test('should timeout if condition never becomes true', async () => {
      await expect(
        poll(
          async () => false,
          { interval: 50, timeout: 200 }
        )
      ).rejects.toThrow();
    });

    test('should poll multiple times before success', async () => {
      let callCount = 0;
      
      await poll(
        async () => {
          callCount++;
          return callCount >= 3;
        },
        { interval: 50, timeout: 1000 }
      );

      expect(callCount).toBe(3);
    });

    test('should handle pollUntilValue with immediate return', async () => {
      const result = await pollUntilValue(
        async () => 'immediate',
        { interval: 100, timeout: 1000 }
      );

      expect(result).toBe('immediate');
    });

    test('should handle pollUntilValue with delayed return', async () => {
      let attempts = 0;
      
      const result = await pollUntilValue(
        async () => {
          attempts++;
          return attempts >= 3 ? 'success' : null;
        },
        { interval: 50, timeout: 1000 }
      );

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('should timeout pollUntilValue if value never returned', async () => {
      await expect(
        pollUntilValue(
          async () => null,
          { interval: 50, timeout: 200 }
        )
      ).rejects.toThrow();
    });

    test('should handle errors in condition function', async () => {
      let attempts = 0;
      
      await expect(
        poll(
          async () => {
            attempts++;
            if (attempts < 2) {
              throw new Error('Temporary error');
            }
            return true;
          },
          { interval: 50, timeout: 1000 }
        )
      ).rejects.toThrow('Temporary error');
    });
  });

  test.describe('YAML Loader Edge Cases', () => {
    let tempDir: string;

    test.beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaml-test-'));
    });

    test.afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('should load simple YAML file', () => {
      const yamlPath = path.join(tempDir, 'simple.yaml');
      const data = { key: 'value', number: 42 };
      
      saveYaml(yamlPath, data);
      const loaded = loadYaml(yamlPath);
      
      expect(loaded).toEqual(data);
    });

    test('should load complex nested YAML', () => {
      const yamlPath = path.join(tempDir, 'complex.yaml');
      const data = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, 3],
              nested: { key: 'value' }
            }
          }
        }
      };
      
      saveYaml(yamlPath, data);
      const loaded = loadYaml(yamlPath);
      
      expect(loaded).toEqual(data);
    });

    test('should load YAML with arrays', () => {
      const yamlPath = path.join(tempDir, 'arrays.yaml');
      const data = {
        users: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 }
        ],
        tags: ['tag1', 'tag2', 'tag3']
      };
      
      saveYaml(yamlPath, data);
      const loaded = loadYaml(yamlPath);
      
      expect(loaded).toEqual(data);
    });

    test('should handle async loading', async () => {
      const yamlPath = path.join(tempDir, 'async.yaml');
      const data = { async: true, value: 123 };
      
      saveYaml(yamlPath, data);
      const loaded = await loadYamlAsync(yamlPath);
      
      expect(loaded).toEqual(data);
    });

    test('should throw on non-existent file', () => {
      expect(() => {
        loadYaml('/nonexistent/path/file.yaml');
      }).toThrow();
    });

    test('should throw on invalid YAML', () => {
      const yamlPath = path.join(tempDir, 'invalid.yaml');
      fs.writeFileSync(yamlPath, 'invalid: yaml: content: [', 'utf-8');
      
      expect(() => {
        loadYaml(yamlPath);
      }).toThrow();
    });

    test('should handle empty YAML file', () => {
      const yamlPath = path.join(tempDir, 'empty.yaml');
      fs.writeFileSync(yamlPath, '', 'utf-8');
      
      const loaded = loadYaml(yamlPath);
      expect(loaded).toBeNull();
    });

    test('should handle special characters in YAML', () => {
      const yamlPath = path.join(tempDir, 'special.yaml');
      const data = {
        special: 'Value with: colon',
        quoted: 'Value with "quotes"',
        multiline: 'Line 1\nLine 2\nLine 3'
      };
      
      saveYaml(yamlPath, data);
      const loaded = loadYaml(yamlPath);
      
      expect(loaded).toEqual(data);
    });

    test('should preserve types', () => {
      const yamlPath = path.join(tempDir, 'types.yaml');
      const data = {
        string: 'text',
        number: 42,
        float: 3.14,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        object: { key: 'value' }
      };
      
      saveYaml(yamlPath, data);
      const loaded = loadYaml(yamlPath);
      
      expect(loaded).toEqual(data);
      expect(typeof loaded.number).toBe('number');
      expect(typeof loaded.float).toBe('number');
      expect(typeof loaded.boolean).toBe('boolean');
    });
  });

  test.describe('File Assertions Edge Cases', () => {
    let tempDir: string;

    test.beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-test-'));
    });

    test.afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test('should assert file exists', () => {
      const filePath = path.join(tempDir, 'exists.txt');
      fs.writeFileSync(filePath, 'content');
      
      expect(() => FileAssertions.exists(filePath)).not.toThrow();
    });

    test('should throw when file does not exist', () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');
      
      expect(() => FileAssertions.exists(filePath)).toThrow();
    });

    test('should assert file not exists', () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');
      
      expect(() => FileAssertions.notExists(filePath)).not.toThrow();
    });

    test('should assert content equals', () => {
      const filePath = path.join(tempDir, 'content.txt');
      const content = 'test content';
      fs.writeFileSync(filePath, content);
      
      expect(() => FileAssertions.contentEquals(filePath, content)).not.toThrow();
    });

    test('should throw when content does not equal', () => {
      const filePath = path.join(tempDir, 'content.txt');
      fs.writeFileSync(filePath, 'actual content');
      
      expect(() => FileAssertions.contentEquals(filePath, 'expected content')).toThrow();
    });

    test('should assert content contains', () => {
      const filePath = path.join(tempDir, 'content.txt');
      fs.writeFileSync(filePath, 'this is a test content');
      
      expect(() => FileAssertions.contentContains(filePath, 'test')).not.toThrow();
    });

    test('should assert content matches regex', () => {
      const filePath = path.join(tempDir, 'content.txt');
      fs.writeFileSync(filePath, 'test123');
      
      expect(() => FileAssertions.contentMatches(filePath, /test\d+/)).not.toThrow();
      expect(() => FileAssertions.contentMatches(filePath, /xyz/)).toThrow();
    });

    test('should assert file size equals', () => {
      const filePath = path.join(tempDir, 'size.txt');
      const content = 'x'.repeat(100);
      fs.writeFileSync(filePath, content);
      
      expect(() => FileAssertions.sizeEquals(filePath, 100)).not.toThrow();
      expect(() => FileAssertions.sizeEquals(filePath, 50)).toThrow();
    });

    test('should assert file size greater than', () => {
      const filePath = path.join(tempDir, 'size.txt');
      fs.writeFileSync(filePath, 'x'.repeat(100));
      
      expect(() => FileAssertions.sizeGreaterThan(filePath, 50)).not.toThrow();
      expect(() => FileAssertions.sizeGreaterThan(filePath, 150)).toThrow();
    });

    test('should assert file is empty', () => {
      const filePath = path.join(tempDir, 'empty.txt');
      fs.writeFileSync(filePath, '');
      
      expect(() => FileAssertions.isEmpty(filePath)).not.toThrow();
    });

    test('should throw when file is not empty', () => {
      const filePath = path.join(tempDir, 'nonempty.txt');
      fs.writeFileSync(filePath, 'content');
      
      expect(() => FileAssertions.isEmpty(filePath)).toThrow();
    });

    test('should assert file is not empty', () => {
      const filePath = path.join(tempDir, 'nonempty.txt');
      fs.writeFileSync(filePath, 'content');
      
      expect(() => FileAssertions.isNotEmpty(filePath)).not.toThrow();
    });

    test('should handle binary files', () => {
      const filePath = path.join(tempDir, 'binary.dat');
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      fs.writeFileSync(filePath, buffer);
      
      expect(() => FileAssertions.exists(filePath)).not.toThrow();
      expect(() => FileAssertions.sizeEquals(filePath, 4)).not.toThrow();
    });

    test('should handle large files', () => {
      const filePath = path.join(tempDir, 'large.txt');
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      fs.writeFileSync(filePath, largeContent);
      
      expect(() => FileAssertions.exists(filePath)).not.toThrow();
      expect(() => FileAssertions.sizeGreaterThan(filePath, 1024 * 1024 - 1)).not.toThrow();
    });

    test('should handle files with special characters in name', () => {
      const filePath = path.join(tempDir, 'special (file) [test].txt');
      fs.writeFileSync(filePath, 'content');
      
      expect(() => FileAssertions.exists(filePath)).not.toThrow();
    });

    test('should handle unicode content', () => {
      const filePath = path.join(tempDir, 'unicode.txt');
      const content = '你好世界 🌍 Привет';
      fs.writeFileSync(filePath, content, 'utf-8');
      
      expect(() => FileAssertions.contentEquals(filePath, content)).not.toThrow();
    });
  });
});
