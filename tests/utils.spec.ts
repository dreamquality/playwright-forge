import { test, expect } from '@playwright/test';
import { 
  validateJsonSchema, 
  assertJsonSchema,
  DataFactory,
  softAssertions,
  poll,
  pollUntilValue,
  FileAssertions
} from '../src';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Utils Tests', () => {
  
  test('JSON Schema validation', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      },
      required: ['name', 'age'],
      additionalProperties: false
    };

    // Valid data
    const validData = { name: 'John', age: 30 };
    const result1 = validateJsonSchema(validData, schema);
    expect(result1.valid).toBe(true);
    expect(result1.errors).toHaveLength(0);

    // Invalid data
    const invalidData = { name: 'John' }; // missing age
    const result2 = validateJsonSchema(invalidData, schema);
    expect(result2.valid).toBe(false);
    expect(result2.errors.length).toBeGreaterThan(0);

    // Assert should not throw for valid data
    expect(() => assertJsonSchema(validData, schema)).not.toThrow();

    // Assert should throw for invalid data
    expect(() => assertJsonSchema(invalidData, schema)).toThrow();
  });

  test('Data Factory generates random data', () => {
    const user = DataFactory.user();
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('firstName');
    expect(user).toHaveProperty('lastName');
    expect(typeof user.email).toBe('string');
    expect(user.email).toContain('@');

    const product = DataFactory.product();
    expect(product).toHaveProperty('id');
    expect(product).toHaveProperty('name');
    expect(product).toHaveProperty('price');
    expect(typeof product.price).toBe('number');

    const company = DataFactory.company();
    expect(company).toHaveProperty('name');
    expect(company).toHaveProperty('website');

    const address = DataFactory.address();
    expect(address).toHaveProperty('city');
    expect(address).toHaveProperty('country');
  });

  test('Soft assertions collect multiple failures', async () => {
    const soft = softAssertions();
    
    await soft.assert(() => expect(1).toBe(1), 'First assertion');
    await soft.assert(() => expect(2).toBe(3), 'Second assertion'); // Will fail
    await soft.assert(() => expect('a').toBe('b'), 'Third assertion'); // Will fail
    
    expect(soft.hasErrors()).toBe(true);
    expect(soft.getErrors()).toHaveLength(2);
    
    expect(() => soft.verify()).toThrow(/Soft assertions failed \(2 errors\)/);
  });

  test('Polling waits for condition', async () => {
    let counter = 0;
    
    const promise = poll(
      () => {
        counter++;
        return counter >= 3;
      },
      { interval: 50, timeout: 5000 }
    );

    await expect(promise).resolves.toBeUndefined();
    expect(counter).toBeGreaterThanOrEqual(3);
  });

  test('Polling until value returns result', async () => {
    let attempts = 0;
    
    const result = await pollUntilValue(
      () => {
        attempts++;
        return attempts >= 3 ? 'success' : null;
      },
      { interval: 50, timeout: 5000 }
    );

    expect(result).toBe('success');
    expect(attempts).toBeGreaterThanOrEqual(3);
  });

  test('File assertions work correctly', async () => {
    const testDir = path.join(process.cwd(), 'test-results', 'file-assertions-test');
    const testFile = path.join(testDir, 'test.txt');
    
    // Ensure directory exists
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create test file
    fs.writeFileSync(testFile, 'Hello World', 'utf-8');

    // Test exists
    expect(() => FileAssertions.exists(testFile)).not.toThrow();
    
    // Test not exists
    const nonExistentFile = path.join(testDir, 'nonexistent.txt');
    expect(() => FileAssertions.notExists(nonExistentFile)).not.toThrow();
    
    // Test content equals
    expect(() => FileAssertions.contentEquals(testFile, 'Hello World')).not.toThrow();
    
    // Test content contains
    expect(() => FileAssertions.contentContains(testFile, 'Hello')).not.toThrow();
    
    // Test content matches
    expect(() => FileAssertions.contentMatches(testFile, /World/)).not.toThrow();
    
    // Test is not empty
    expect(() => FileAssertions.isNotEmpty(testFile)).not.toThrow();

    // Cleanup
    fs.unlinkSync(testFile);
  });

  test('Data Factory array generation', () => {
    const users = DataFactory.array(() => DataFactory.user(), 5);
    expect(users).toHaveLength(5);
    users.forEach(user => {
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('firstName');
    });
  });

  test('Data Factory with seed produces consistent results', () => {
    DataFactory.seed(12345);
    const user1 = DataFactory.user();
    
    DataFactory.seed(12345);
    const user2 = DataFactory.user();
    
    expect(user1.email).toBe(user2.email);
    expect(user1.firstName).toBe(user2.firstName);
  });
});
