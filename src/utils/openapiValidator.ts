import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

/**
 * Options for OpenAPI validation
 */
export interface OpenApiValidationOptions {
  /**
   * OpenAPI specification source
   * Can be a URL, file path, or already loaded object
   */
  spec: string | object;

  /**
   * API path to validate (e.g., '/users/{id}')
   */
  path: string;

  /**
   * HTTP method (get, post, put, delete, etc.)
   */
  method: string;

  /**
   * HTTP status code (200, 404, etc.)
   */
  status: number | string;

  /**
   * Response body to validate
   */
  responseBody: unknown;

  /**
   * Strict mode - fail on additional properties not in schema
   * @default false
   */
  strict?: boolean;

  /**
   * Allow additional properties in objects
   * @default true
   */
  allowAdditionalProperties?: boolean;

  /**
   * Custom AJV options
   */
  ajvOptions?: ConstructorParameters<typeof Ajv>[0];

  /**
   * Custom path parameter resolver
   * Converts templated paths like '/users/{id}' to match actual paths
   */
  pathResolver?: (templatePath: string, actualPath?: string) => string;

  /**
   * Cache the parsed OpenAPI spec in memory
   * @default true
   */
  cacheSpec?: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  schema?: object;
  ajvErrors?: ErrorObject[] | null;
  path?: string;
  method?: string;
  status?: number | string;
}

/**
 * Internal cache for parsed OpenAPI specs
 */
const specCache = new Map<string, any>();

/**
 * OpenAPI Schema Validator
 * Validates API responses against OpenAPI specifications
 */
export class OpenApiValidator {
  private ajv: Ajv;

  constructor(options?: ConstructorParameters<typeof Ajv>[0]) {
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateFormats: true,
      ...options,
    });
    addFormats(this.ajv);
  }

  /**
   * Loads OpenAPI spec from various sources
   * @param spec - URL, file path, or object
   * @param useCache - Whether to use cached spec
   */
  private async loadSpec(spec: string | object, useCache: boolean = true): Promise<any> {
    // If it's already an object, return it
    if (typeof spec === 'object') {
      return spec;
    }

    // Check cache
    const cacheKey = spec;
    if (useCache && specCache.has(cacheKey)) {
      return specCache.get(cacheKey);
    }

    let parsedSpec: any;

    // Check if it's a URL
    if (spec.startsWith('http://') || spec.startsWith('https://')) {
      parsedSpec = await this.loadSpecFromUrl(spec);
    } else {
      // Assume it's a file path
      parsedSpec = await this.loadSpecFromFile(spec);
    }

    // Resolve $ref references
    parsedSpec = this.resolveRefs(parsedSpec);

    // Cache the spec
    if (useCache) {
      specCache.set(cacheKey, parsedSpec);
    }

    return parsedSpec;
  }

  /**
   * Loads OpenAPI spec from URL
   */
  private async loadSpecFromUrl(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec from ${url}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (contentType.includes('yaml') || contentType.includes('yml') || url.endsWith('.yaml') || url.endsWith('.yml')) {
      return YAML.parse(text);
    } else {
      return JSON.parse(text);
    }
  }

  /**
   * Loads OpenAPI spec from file
   */
  private async loadSpecFromFile(filePath: string): Promise<any> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`OpenAPI spec file not found: ${filePath}`);
    }

    const content = await fs.promises.readFile(absolutePath, 'utf-8');
    const ext = path.extname(absolutePath).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      return YAML.parse(content);
    } else if (ext === '.json') {
      return JSON.parse(content);
    } else {
      throw new Error(`Unsupported file format: ${ext}. Use .json, .yaml, or .yml`);
    }
  }

  /**
   * Resolves $ref references in OpenAPI spec
   * Simple implementation - only handles internal references
   */
  private resolveRefs(spec: any, root?: any): any {
    if (!root) root = spec;

    if (typeof spec !== 'object' || spec === null) {
      return spec;
    }

    if (Array.isArray(spec)) {
      return spec.map(item => this.resolveRefs(item, root));
    }

    // Handle $ref
    if (spec.$ref && typeof spec.$ref === 'string') {
      const refPath = spec.$ref.replace(/^#\//, '').split('/');
      let resolved = root;
      for (const part of refPath) {
        resolved = resolved[part];
        if (!resolved) {
          throw new Error(`Failed to resolve $ref: ${spec.$ref}`);
        }
      }
      // Recursively resolve the referenced object
      return this.resolveRefs(resolved, root);
    }

    // Recursively process all properties
    const result: any = {};
    for (const key in spec) {
      result[key] = this.resolveRefs(spec[key], root);
    }
    return result;
  }

  /**
   * Extracts response schema for a specific path, method, and status
   */
  private extractResponseSchema(
    spec: any,
    apiPath: string,
    method: string,
    status: number | string
  ): object | null {
    const paths = spec.paths || {};
    const pathItem = paths[apiPath];

    if (!pathItem) {
      throw new Error(`Path not found in OpenAPI spec: ${apiPath}`);
    }

    const operation = pathItem[method.toLowerCase()];
    if (!operation) {
      throw new Error(`Method ${method} not found for path ${apiPath}`);
    }

    const responses = operation.responses || {};
    const statusStr = String(status);
    const response = responses[statusStr] || responses['default'];

    if (!response) {
      throw new Error(`Status ${status} not found in responses for ${method} ${apiPath}`);
    }

    // OpenAPI 3.x structure
    const content = response.content || {};
    const jsonContent = content['application/json'] || content['*/*'];

    if (!jsonContent || !jsonContent.schema) {
      throw new Error(`No JSON schema found for ${method} ${apiPath} ${status}`);
    }

    return jsonContent.schema;
  }

  /**
   * Validates response against OpenAPI spec
   */
  async validateResponse(options: OpenApiValidationOptions): Promise<ValidationResult> {
    const {
      spec,
      path: apiPath,
      method,
      status,
      responseBody,
      strict = false,
      allowAdditionalProperties = true,
      cacheSpec = true,
    } = options;

    try {
      // Load and parse the spec
      const parsedSpec = await this.loadSpec(spec, cacheSpec);

      // Extract the response schema
      const schema = this.extractResponseSchema(parsedSpec, apiPath, method, status);

      // Modify schema based on options
      let finalSchema = { ...schema };
      
      // Handle additionalProperties settings
      if (strict) {
        // Strict mode: don't allow additional properties
        finalSchema = this.setAdditionalProperties(finalSchema, false);
      } else if (allowAdditionalProperties) {
        // Explicitly allow additional properties (override schema defaults)
        finalSchema = this.setAdditionalProperties(finalSchema, true);
      }
      // If neither strict nor allowAdditionalProperties is explicitly set,
      // use the schema as-is (preserves original additionalProperties settings)

      // Create validator with custom options
      const validator = this.ajv.compile(finalSchema);

      // Validate
      const valid = validator(responseBody);

      if (!valid) {
        const errors = validator.errors?.map(err => {
          const path = err.instancePath || 'root';
          const message = err.message || 'validation failed';
          const params = err.params ? ` (${JSON.stringify(err.params)})` : '';
          return `${path}: ${message}${params}`;
        }) || [];

        return {
          valid: false,
          errors,
          schema: finalSchema,
          ajvErrors: validator.errors,
          path: apiPath,
          method,
          status,
        };
      }

      return {
        valid: true,
        errors: [],
        schema: finalSchema,
        path: apiPath,
        method,
        status,
      };
    } catch (error: any) {
      return {
        valid: false,
        errors: [error.message || 'Validation error'],
        path: apiPath,
        method,
        status,
      };
    }
  }

  /**
   * Recursively sets additionalProperties in a schema
   */
  private setAdditionalProperties(schema: any, value: boolean): any {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map(item => this.setAdditionalProperties(item, value));
    }

    const result: any = { ...schema };

    // Always set additionalProperties if type is object or if it's already present
    if (result.type === 'object' || result.additionalProperties !== undefined) {
      result.additionalProperties = value;
    }

    // Recursively process nested schemas
    if (result.properties) {
      result.properties = Object.keys(result.properties).reduce((acc: any, key: string) => {
        acc[key] = this.setAdditionalProperties(result.properties[key], value);
        return acc;
      }, {});
    }

    if (result.items) {
      result.items = this.setAdditionalProperties(result.items, value);
    }

    if (result.allOf) {
      result.allOf = result.allOf.map((s: any) => this.setAdditionalProperties(s, value));
    }

    if (result.anyOf) {
      result.anyOf = result.anyOf.map((s: any) => this.setAdditionalProperties(s, value));
    }

    if (result.oneOf) {
      result.oneOf = result.oneOf.map((s: any) => this.setAdditionalProperties(s, value));
    }

    return result;
  }

  /**
   * Clears the spec cache
   */
  static clearCache(): void {
    specCache.clear();
  }
}

/**
 * Convenience function to validate a response
 * Creates a validator instance and validates in one call
 */
export async function validateResponse(
  options: OpenApiValidationOptions
): Promise<ValidationResult> {
  const validator = new OpenApiValidator(options.ajvOptions);
  return validator.validateResponse(options);
}

/**
 * Convenience function that throws on validation failure
 */
export async function assertValidResponse(
  options: OpenApiValidationOptions
): Promise<void> {
  const result = await validateResponse(options);

  if (!result.valid) {
    const errorDetails = [
      `OpenAPI validation failed for ${options.method.toUpperCase()} ${options.path} (${options.status})`,
      '',
      'Errors:',
      ...result.errors.map(err => `  - ${err}`),
    ];

    if (result.schema) {
      errorDetails.push('', 'Expected schema:', JSON.stringify(result.schema, null, 2));
    }

    throw new Error(errorDetails.join('\n'));
  }
}
