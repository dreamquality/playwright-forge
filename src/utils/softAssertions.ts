/**
 * Soft assertion collector
 * Collects multiple assertion failures and reports them all at once
 */
export class SoftAssertions {
  private errors: Error[] = [];

  /**
   * Add a soft assertion
   * @param assertion - The assertion function
   * @param message - Optional custom error message
   */
  async assert(assertion: () => Promise<void> | void, message?: string): Promise<void> {
    try {
      await assertion();
    } catch (error) {
      const assertionError = error instanceof Error ? error : new Error(String(error));
      if (message) {
        assertionError.message = `${message}: ${assertionError.message}`;
      }
      this.errors.push(assertionError);
    }
  }

  /**
   * Check if any assertions failed
   */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /**
   * Get all collected errors
   */
  getErrors(): Error[] {
    return [...this.errors];
  }

  /**
   * Verify all assertions - throws if any failed
   * @throws Error with all collected assertion failures
   */
  verify(): void {
    if (this.errors.length > 0) {
      const errorMessages = this.errors.map((err, idx) => 
        `${idx + 1}. ${err.message}`
      ).join('\n');
      
      throw new Error(
        `Soft assertions failed (${this.errors.length} errors):\n${errorMessages}`
      );
    }
  }

  /**
   * Clear all collected errors
   */
  clear(): void {
    this.errors = [];
  }
}

/**
 * Create a new soft assertion collector
 */
export function softAssertions(): SoftAssertions {
  return new SoftAssertions();
}
