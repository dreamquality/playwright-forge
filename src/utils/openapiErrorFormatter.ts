import { ErrorObject } from 'ajv';

/**
 * Validation context for error formatting
 */
export interface ValidationContext {
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Resolved OpenAPI path template (e.g., '/users/{id}') */
  resolvedPath: string;
  /** Actual request URL */
  actualUrl?: string;
  /** Response status code */
  status: number | string;
  /** Content-Type header value */
  contentType?: string;
  /** Validation mode */
  validationMode?: 'strict' | 'hybrid' | 'tolerant';
  /** OpenAPI schema fragment used for validation */
  schema?: any;
}

/**
 * Configuration for error formatting
 */
export interface ErrorFormatterConfig {
  /**
   * Error format style
   * - 'short': Concise, single-line per error
   * - 'detailed': Multi-line with full context
   * @default 'detailed'
   */
  errorFormat?: 'short' | 'detailed';

  /**
   * Maximum number of errors to display
   * @default 10
   */
  maxErrors?: number;

  /**
   * Fields to redact from error output (e.g., 'password', 'token')
   * @default []
   */
  redactFields?: string[];

  /**
   * Show OpenAPI schema snippet in output
   * @default true
   */
  showSchemaSnippet?: boolean;

  /**
   * Include raw AJV errors for debugging
   * @default false
   */
  debugRawErrors?: boolean;
}

/**
 * Formatted error information
 */
export interface FormattedError {
  /** JSON path to the field (e.g., '$.data.user.email') */
  jsonPath: string;
  /** Expected type or constraint */
  expected: string;
  /** Actual value (redacted if sensitive) */
  actual: string;
  /** Plain English explanation */
  explanation: string;
}

/**
 * Formats OpenAPI validation errors in human-readable format
 * 
 * This formatter converts raw AJV validation errors into clear, actionable messages
 * that QA and backend engineers can quickly understand and debug.
 * 
 * @example
 * ```typescript
 * const formatter = new OpenApiErrorFormatter({
 *   errorFormat: 'detailed',
 *   maxErrors: 5,
 *   redactFields: ['password', 'token', 'apiKey']
 * });
 * 
 * const formatted = formatter.format(ajvErrors, {
 *   method: 'POST',
 *   resolvedPath: '/users',
 *   actualUrl: 'https://api.example.com/users',
 *   status: 400,
 *   contentType: 'application/json'
 * });
 * 
 * console.error(formatted);
 * ```
 */
export class OpenApiErrorFormatter {
  private config: Required<ErrorFormatterConfig>;

  constructor(config: ErrorFormatterConfig = {}) {
    this.config = {
      errorFormat: config.errorFormat ?? 'detailed',
      maxErrors: config.maxErrors ?? 10,
      redactFields: config.redactFields ?? [],
      showSchemaSnippet: config.showSchemaSnippet ?? true,
      debugRawErrors: config.debugRawErrors ?? false,
    };
  }

  /**
   * Format validation errors into human-readable output
   */
  format(errors: ErrorObject[], context: ValidationContext): string {
    if (!errors || errors.length === 0) {
      return '';
    }

    const lines: string[] = [];

    // Header section
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('  OpenAPI Validation Failed');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');

    // Request context
    lines.push('Request Context:');
    lines.push(`  Method:       ${context.method.toUpperCase()}`);
    lines.push(`  Path:         ${context.resolvedPath}`);
    if (context.actualUrl) {
      lines.push(`  URL:          ${context.actualUrl}`);
    }
    lines.push(`  Status:       ${context.status}`);
    if (context.contentType) {
      lines.push(`  Content-Type: ${context.contentType}`);
    }
    lines.push('');

    // Validation summary
    const totalErrors = errors.length;
    const displayedErrors = Math.min(totalErrors, this.config.maxErrors);
    lines.push('Validation Summary:');
    lines.push(`  Total Errors: ${totalErrors}`);
    if (totalErrors > this.config.maxErrors) {
      lines.push(`  Showing:      ${displayedErrors} (limited by maxErrors)`);
    }
    if (context.validationMode) {
      lines.push(`  Mode:         ${context.validationMode}`);
    }
    lines.push('');

    // Format individual errors
    lines.push('Validation Errors:');
    lines.push('');
    
    const formattedErrors = this.parseErrors(errors);
    const limitedErrors = formattedErrors.slice(0, this.config.maxErrors);

    limitedErrors.forEach((error, index) => {
      if (this.config.errorFormat === 'short') {
        lines.push(`  ${index + 1}. ${error.jsonPath}: ${error.explanation}`);
      } else {
        lines.push(`  Error ${index + 1}:`);
        lines.push(`    Field:       ${error.jsonPath}`);
        lines.push(`    Expected:    ${error.expected}`);
        lines.push(`    Actual:      ${error.actual}`);
        lines.push(`    Explanation: ${error.explanation}`);
        lines.push('');
      }
    });

    if (totalErrors > this.config.maxErrors) {
      lines.push(`  ... and ${totalErrors - this.config.maxErrors} more error(s)`);
      lines.push('');
    }

    // Schema snippet
    if (this.config.showSchemaSnippet && context.schema) {
      lines.push('Schema Context:');
      lines.push('');
      const schemaSnippet = this.formatSchemaSnippet(context.schema);
      lines.push(schemaSnippet);
      lines.push('');
    }

    // Raw errors for debugging
    if (this.config.debugRawErrors) {
      lines.push('Raw AJV Errors (debug):');
      lines.push('');
      lines.push(JSON.stringify(errors, null, 2));
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Parse AJV errors into structured format
   */
  private parseErrors(errors: ErrorObject[]): FormattedError[] {
    return errors.map(error => {
      const jsonPath = this.buildJsonPath(error);
      const expected = this.buildExpectedMessage(error);
      const actual = this.buildActualMessage(error);
      const explanation = this.buildExplanation(error);

      return {
        jsonPath,
        expected,
        actual,
        explanation,
      };
    });
  }

  /**
   * Build JSON path from AJV error
   */
  private buildJsonPath(error: ErrorObject): string {
    const instancePath = error.instancePath || '';
    const path = instancePath.replace(/\//g, '.').replace(/^\./, '');
    return path ? `$.${path}` : '$';
  }

  /**
   * Build expected value/constraint message
   */
  private buildExpectedMessage(error: ErrorObject): string {
    const { keyword, params } = error;

    switch (keyword) {
      case 'type':
        return `type: ${params.type}`;
      case 'required':
        return `required property: ${params.missingProperty}`;
      case 'enum':
        return `one of: ${params.allowedValues?.join(', ')}`;
      case 'minimum':
        return `minimum: ${params.limit}`;
      case 'maximum':
        return `maximum: ${params.limit}`;
      case 'minLength':
        return `minimum length: ${params.limit}`;
      case 'maxLength':
        return `maximum length: ${params.limit}`;
      case 'pattern':
        return `pattern: ${params.pattern}`;
      case 'format':
        return `format: ${params.format}`;
      case 'minItems':
        return `minimum items: ${params.limit}`;
      case 'maxItems':
        return `maximum items: ${params.limit}`;
      case 'additionalProperties':
        return 'no additional properties allowed';
      default:
        return keyword;
    }
  }

  /**
   * Build actual value message (with redaction)
   */
  private buildActualMessage(error: ErrorObject): string {
    const { keyword, params } = error;
    const data = error.data;

    // Check if field should be redacted
    const path = this.buildJsonPath(error);
    const fieldName = path.split('.').pop() || '';
    if (this.shouldRedact(fieldName)) {
      return '[REDACTED]';
    }

    // Format actual value based on error type
    switch (keyword) {
      case 'type':
        return `type: ${typeof data}`;
      case 'required':
        return 'missing';
      case 'additionalProperties':
        return `has property: ${params.additionalProperty}`;
      case 'enum':
        return `value: ${JSON.stringify(data)}`;
      case 'pattern':
      case 'format':
        return `value: ${JSON.stringify(data)}`;
      default:
        if (data === undefined) return 'undefined';
        if (data === null) return 'null';
        if (typeof data === 'string') return `"${data}"`;
        if (Array.isArray(data)) return `array[${data.length}]`;
        if (typeof data === 'object') return 'object';
        return String(data);
    }
  }

  /**
   * Build plain English explanation
   */
  private buildExplanation(error: ErrorObject): string {
    const { keyword, params, message } = error;

    switch (keyword) {
      case 'type':
        return `Expected ${params.type} but got ${typeof error.data}`;
      case 'required':
        return `Missing required property "${params.missingProperty}"`;
      case 'enum':
        return `Value must be one of: ${params.allowedValues?.join(', ')}`;
      case 'minimum':
        return `Value must be >= ${params.limit}`;
      case 'maximum':
        return `Value must be <= ${params.limit}`;
      case 'minLength':
        return `String must be at least ${params.limit} characters long`;
      case 'maxLength':
        return `String must be at most ${params.limit} characters long`;
      case 'pattern':
        return `String must match pattern: ${params.pattern}`;
      case 'format':
        return `String must be valid ${params.format} format`;
      case 'minItems':
        return `Array must have at least ${params.limit} items`;
      case 'maxItems':
        return `Array must have at most ${params.limit} items`;
      case 'additionalProperties':
        return `Property "${params.additionalProperty}" is not allowed (strict mode)`;
      default:
        return message || `Validation failed: ${keyword}`;
    }
  }

  /**
   * Check if field should be redacted
   */
  private shouldRedact(fieldName: string): boolean {
    const lowerField = fieldName.toLowerCase();
    return this.config.redactFields.some(redactField =>
      lowerField.indexOf(redactField.toLowerCase()) !== -1
    );
  }

  /**
   * Format schema snippet for display
   */
  private formatSchemaSnippet(schema: any): string {
    try {
      // Limit schema depth and size for readability
      const limited = this.limitSchemaDepth(schema, 3);
      const formatted = JSON.stringify(limited, null, 2);
      
      // Add indentation
      return formatted
        .split('\n')
        .map(line => `  ${line}`)
        .join('\n');
    } catch (error) {
      return '  [Schema too complex to display]';
    }
  }

  /**
   * Limit schema depth to keep output manageable
   */
  private limitSchemaDepth(obj: any, maxDepth: number, currentDepth: number = 0): any {
    if (currentDepth >= maxDepth) {
      return '...';
    }

    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.limitSchemaDepth(item, maxDepth, currentDepth + 1));
    }

    const result: any = {};
    for (const key in obj) {
      // Skip some verbose AJV internals
      if (key === '$id' || key === '$schema' || key === 'definitions') {
        continue;
      }
      result[key] = this.limitSchemaDepth(obj[key], maxDepth, currentDepth + 1);
    }
    return result;
  }
}

/**
 * Create a default error formatter instance
 */
export function createErrorFormatter(config?: ErrorFormatterConfig): OpenApiErrorFormatter {
  return new OpenApiErrorFormatter(config);
}
