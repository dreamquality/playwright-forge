/**
 * Context for grouping soft assertions
 */
export type AssertionContext = 'UI' | 'API' | 'Validation' | string;

/**
 * Error with context information
 */
export interface ContextualError {
  error: Error;
  context?: AssertionContext;
  timestamp: number;
}

/**
 * Export format for CI annotations
 */
export interface CIAnnotationReport {
  totalErrors: number;
  contexts: Record<string, number>;
  errors: Array<{
    message: string;
    context?: string;
    timestamp: number;
  }>;
}

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
 * Enhanced soft assertion collector with context support
 * Compatible with Playwright expect API
 */
export class SoftExpect {
  private errors: ContextualError[] = [];

  /**
   * Perform a soft assertion using Playwright expect
   * @param actual - The value to assert on
   * @returns Proxy that intercepts expect matchers
   */
  expect<T>(actual: T): any {
    return this.createExpectProxy(actual, undefined);
  }

  /**
   * Create a contextual soft expect for UI assertions
   */
  get ui() {
    return <T>(actual: T) => this.createExpectProxy(actual, 'UI');
  }

  /**
   * Create a contextual soft expect for API assertions
   */
  get api() {
    return <T>(actual: T) => this.createExpectProxy(actual, 'API');
  }

  /**
   * Create a contextual soft expect for validation assertions
   */
  get validation() {
    return <T>(actual: T) => this.createExpectProxy(actual, 'Validation');
  }

  /**
   * Create a contextual soft expect with custom context
   * @param context - The context name
   */
  withContext(context: AssertionContext): <T>(actual: T) => any {
    return <T>(actual: T) => this.createExpectProxy(actual, context);
  }

  /**
   * Create an expect proxy with optional context
   */
  private createExpectProxy<T>(actual: T, context?: AssertionContext, propertyChain: PropertyKey[] = []): any {
    const handler: ProxyHandler<any> = {
      get: (_target, prop: PropertyKey) => {
        // Avoid being treated as a Promise by frameworks that probe for `then`
        if (prop === 'then') {
          return undefined;
        }

        const newChain = [...propertyChain, prop];
        return this.createExpectProxy(actual, context, newChain);
      },
      apply: (_target, _thisArg, args: any[]) => {
        return this.captureAssertion(async () => {
          // Import expect dynamically to avoid circular dependencies
          const { expect } = await import('@playwright/test');
          let expectChain: any = (expect as any)(actual);

          if (propertyChain.length === 0) {
            // Called directly: softExpect.expect(value)(...)
            if (typeof expectChain === 'function') {
              return await expectChain.apply(expectChain, args);
            }
            return;
          }

          // Walk through the property chain (e.g. ['not', 'toBe'])
          for (let i = 0; i < propertyChain.length; i++) {
            const prop = propertyChain[i];
            const value = expectChain[prop];

            // If this is the last property in the chain and it's a function, invoke it
            if (i === propertyChain.length - 1 && typeof value === 'function') {
              return await value.apply(expectChain, args);
            }

            // Otherwise, continue traversing the chain
            expectChain = value;

            // If the chain cannot be followed further (e.g., invalid property access),
            // return gracefully to avoid runtime errors. This can happen if someone tries
            // to access a non-existent property in the expect chain.
            if (expectChain == null) {
              return;
            }
          }
        }, context);
      },
    };

    // Use a callable target so that the proxy can be invoked as a function.
    // The noop function serves as the target for the Proxy, allowing the 'apply' handler
    // to intercept function calls on the proxy (e.g., when calling toBe(1) after .not).
    const target = function () { /* noop */ };
    return new Proxy(target as any, handler);
  }

  /**
   * Capture and store assertion errors
   */
  private async captureAssertion(assertion: () => Promise<void>, context?: AssertionContext): Promise<void> {
    try {
      await assertion();
    } catch (error) {
      const assertionError = error instanceof Error ? error : new Error(String(error));
      this.errors.push({
        error: assertionError,
        context,
        timestamp: Date.now(),
      });
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
  getErrors(): ContextualError[] {
    return [...this.errors];
  }

  /**
   * Get errors grouped by context
   */
  getErrorsByContext(): Map<AssertionContext | 'uncategorized', ContextualError[]> {
    const grouped = new Map<AssertionContext | 'uncategorized', ContextualError[]>();
    
    for (const error of this.errors) {
      const context = error.context || 'uncategorized';
      if (!grouped.has(context)) {
        grouped.set(context, []);
      }
      grouped.get(context)!.push(error);
    }
    
    return grouped;
  }

  /**
   * Verify all assertions - throws if any failed
   * Alias for assertAll for compatibility
   */
  assertAll(): void {
    this.verify();
  }

  /**
   * Verify all assertions - throws if any failed
   * @throws Error with all collected assertion failures grouped by context
   */
  verify(): void {
    if (this.errors.length === 0) {
      return;
    }

    const grouped = this.getErrorsByContext();
    const sections: string[] = [];

    sections.push(`Soft assertions failed (${this.errors.length} error${this.errors.length > 1 ? 's' : ''}):\n`);

    for (const [context, errors] of grouped) {
      sections.push(`[${context}] ${errors.length} error${errors.length > 1 ? 's' : ''}:`);
      errors.forEach((err, idx) => {
        sections.push(`  ${idx + 1}. ${err.error.message}`);
      });
      sections.push('');
    }

    throw new Error(sections.join('\n'));
  }

  /**
   * Export errors as CI annotation format
   */
  exportCIAnnotations(): CIAnnotationReport {
    const contexts: Record<string, number> = {};
    
    for (const error of this.errors) {
      const context = error.context || 'uncategorized';
      contexts[context] = (contexts[context] || 0) + 1;
    }

    return {
      totalErrors: this.errors.length,
      contexts,
      errors: this.errors.map(err => ({
        message: err.error.message,
        context: err.context,
        timestamp: err.timestamp,
      })),
    };
  }

  /**
   * Export errors as JSON
   */
  exportJSON(): string {
    return JSON.stringify(this.exportCIAnnotations(), null, 2);
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

/**
 * Create a new soft expect instance
 */
export function softExpect(): SoftExpect {
  return new SoftExpect();
}
