import * as fs from 'fs';
import * as path from 'path';

/**
 * File assertion utilities
 */
export class FileAssertions {
  /**
   * Assert that a file exists
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
   * Assert that a file does not exist
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
   * Assert file content matches expected value
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
   * Assert file content contains substring
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
   * Assert file content matches regex pattern
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
   * Assert file size
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
   * Assert file size is greater than
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
   * Assert file is empty
   * @param filePath - Path to the file
   * @throws Error if file is not empty
   */
  static isEmpty(filePath: string): void {
    this.sizeEquals(filePath, 0);
  }

  /**
   * Assert file is not empty
   * @param filePath - Path to the file
   * @throws Error if file is empty
   */
  static isNotEmpty(filePath: string): void {
    this.sizeGreaterThan(filePath, 0);
  }
}
