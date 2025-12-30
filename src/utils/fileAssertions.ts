import * as fs from 'fs';
import * as path from 'path';

/**
 * File assertion utilities for testing file operations
 * 
 * @note These methods use synchronous file operations (fs.*Sync) which can block
 * the event loop. This is acceptable in test code where simplicity is preferred,
 * but if you have test suites with many file assertions and need better performance,
 * consider using the async alternatives provided in FileAssertionsAsync.
 */
export class FileAssertions {
  /**
   * Assert that a file exists (synchronous)
   * @param filePath - Path to the file
   * @throws Error if file does not exist
   */
  static exists(filePath: string): void {
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
  }

  /**
   * Assert that a file does not exist (synchronous)
   * @param filePath - Path to the file
   * @throws Error if file exists
   */
  static notExists(filePath: string): void {
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    if (fs.existsSync(absolutePath)) {
      throw new Error(`File exists but should not: ${filePath}`);
    }
  }

  /**
   * Assert file content matches expected value (synchronous)
   * @param filePath - Path to the file
   * @param expectedContent - Expected content
   * @param encoding - File encoding (default: utf-8)
   * @throws Error if content does not match
   */
  static contentEquals(
    filePath: string, 
    expectedContent: string, 
    encoding: BufferEncoding = 'utf-8'
  ): void {
    this.exists(filePath);
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    const actualContent = fs.readFileSync(absolutePath, encoding);
    
    if (actualContent !== expectedContent) {
      throw new Error(
        `File content does not match.\nExpected:\n${expectedContent}\n\nActual:\n${actualContent}`
      );
    }
  }

  /**
   * Assert file content contains substring (synchronous)
   * @param filePath - Path to the file
   * @param substring - Substring to search for
   * @param encoding - File encoding (default: utf-8)
   * @throws Error if substring not found
   */
  static contentContains(
    filePath: string, 
    substring: string, 
    encoding: BufferEncoding = 'utf-8'
  ): void {
    this.exists(filePath);
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    const content = fs.readFileSync(absolutePath, encoding);
    
    if (!content.includes(substring)) {
      throw new Error(
        `File content does not contain expected substring.\nLooking for: ${substring}`
      );
    }
  }

  /**
   * Assert file content matches regex pattern (synchronous)
   * @param filePath - Path to the file
   * @param pattern - Regex pattern to match
   * @param encoding - File encoding (default: utf-8)
   * @throws Error if pattern does not match
   */
  static contentMatches(
    filePath: string, 
    pattern: RegExp, 
    encoding: BufferEncoding = 'utf-8'
  ): void {
    this.exists(filePath);
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    const content = fs.readFileSync(absolutePath, encoding);
    
    if (!pattern.test(content)) {
      throw new Error(
        `File content does not match pattern ${pattern}`
      );
    }
  }

  /**
   * Assert file size (synchronous)
   * @param filePath - Path to the file
   * @param expectedSize - Expected size in bytes
   * @throws Error if size does not match
   */
  static sizeEquals(filePath: string, expectedSize: number): void {
    this.exists(filePath);
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    const stats = fs.statSync(absolutePath);
    
    if (stats.size !== expectedSize) {
      throw new Error(
        `File size does not match. Expected: ${expectedSize}, Actual: ${stats.size}`
      );
    }
  }

  /**
   * Assert file size is greater than (synchronous)
   * @param filePath - Path to the file
   * @param minSize - Minimum size in bytes
   * @throws Error if size is not greater
   */
  static sizeGreaterThan(filePath: string, minSize: number): void {
    this.exists(filePath);
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    const stats = fs.statSync(absolutePath);
    
    if (stats.size <= minSize) {
      throw new Error(
        `File size ${stats.size} is not greater than ${minSize}`
      );
    }
  }

  /**
   * Assert file is empty (synchronous)
   * @param filePath - Path to the file
   * @throws Error if file is not empty
   */
  static isEmpty(filePath: string): void {
    this.sizeEquals(filePath, 0);
  }

  /**
   * Assert file is not empty (synchronous)
   * @param filePath - Path to the file
   * @throws Error if file is empty
   */
  static isNotEmpty(filePath: string): void {
    this.sizeGreaterThan(filePath, 0);
  }
}

/**
 * Async file assertion utilities for better performance in large test suites
 * 
 * @note These methods use asynchronous file operations (fs.promises) which don't
 * block the event loop, providing better performance when dealing with many file
 * assertions in parallel.
 */
export class FileAssertionsAsync {
  /**
   * Assert that a file exists (asynchronous)
   * @param filePath - Path to the file
   * @throws Error if file does not exist
   */
  static async exists(filePath: string): Promise<void> {
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    try {
      await fs.promises.access(absolutePath);
    } catch {
      throw new Error(`File does not exist: ${filePath}`);
    }
  }

  /**
   * Assert that a file does not exist (asynchronous)
   * @param filePath - Path to the file
   * @throws Error if file exists
   */
  static async notExists(filePath: string): Promise<void> {
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    try {
      await fs.promises.access(absolutePath);
      throw new Error(`File exists but should not: ${filePath}`);
    } catch (error: any) {
      if (error.message?.includes('File exists but should not')) {
        throw error;
      }
      // File doesn't exist, which is what we want
    }
  }

  /**
   * Assert file content matches expected value (asynchronous)
   * @param filePath - Path to the file
   * @param expectedContent - Expected content
   * @param encoding - File encoding (default: utf-8)
   * @throws Error if content does not match
   */
  static async contentEquals(
    filePath: string, 
    expectedContent: string, 
    encoding: BufferEncoding = 'utf-8'
  ): Promise<void> {
    await this.exists(filePath);
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    const actualContent = await fs.promises.readFile(absolutePath, encoding);
    
    if (actualContent !== expectedContent) {
      throw new Error(
        `File content does not match.\nExpected:\n${expectedContent}\n\nActual:\n${actualContent}`
      );
    }
  }

  /**
   * Assert file content contains substring (asynchronous)
   * @param filePath - Path to the file
   * @param substring - Substring to search for
   * @param encoding - File encoding (default: utf-8)
   * @throws Error if substring not found
   */
  static async contentContains(
    filePath: string, 
    substring: string, 
    encoding: BufferEncoding = 'utf-8'
  ): Promise<void> {
    await this.exists(filePath);
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    const content = await fs.promises.readFile(absolutePath, encoding);
    
    if (!content.includes(substring)) {
      throw new Error(
        `File content does not contain expected substring.\nLooking for: ${substring}`
      );
    }
  }

  /**
   * Assert file content matches regex pattern (asynchronous)
   * @param filePath - Path to the file
   * @param pattern - Regex pattern to match
   * @param encoding - File encoding (default: utf-8)
   * @throws Error if pattern does not match
   */
  static async contentMatches(
    filePath: string, 
    pattern: RegExp, 
    encoding: BufferEncoding = 'utf-8'
  ): Promise<void> {
    await this.exists(filePath);
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    const content = await fs.promises.readFile(absolutePath, encoding);
    
    if (!pattern.test(content)) {
      throw new Error(
        `File content does not match pattern ${pattern}`
      );
    }
  }

  /**
   * Assert file size (asynchronous)
   * @param filePath - Path to the file
   * @param expectedSize - Expected size in bytes
   * @throws Error if size does not match
   */
  static async sizeEquals(filePath: string, expectedSize: number): Promise<void> {
    await this.exists(filePath);
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    const stats = await fs.promises.stat(absolutePath);
    
    if (stats.size !== expectedSize) {
      throw new Error(
        `File size does not match. Expected: ${expectedSize}, Actual: ${stats.size}`
      );
    }
  }

  /**
   * Assert file size is greater than (asynchronous)
   * @param filePath - Path to the file
   * @param minSize - Minimum size in bytes
   * @throws Error if size is not greater
   */
  static async sizeGreaterThan(filePath: string, minSize: number): Promise<void> {
    await this.exists(filePath);
    
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(process.cwd(), filePath);
    
    const stats = await fs.promises.stat(absolutePath);
    
    if (stats.size <= minSize) {
      throw new Error(
        `File size ${stats.size} is not greater than ${minSize}`
      );
    }
  }

  /**
   * Assert file is empty (asynchronous)
   * @param filePath - Path to the file
   * @throws Error if file is not empty
   */
  static async isEmpty(filePath: string): Promise<void> {
    await this.sizeEquals(filePath, 0);
  }

  /**
   * Assert file is not empty (asynchronous)
   * @param filePath - Path to the file
   * @throws Error if file is empty
   */
  static async isNotEmpty(filePath: string): Promise<void> {
    await this.sizeGreaterThan(filePath, 0);
  }
}
