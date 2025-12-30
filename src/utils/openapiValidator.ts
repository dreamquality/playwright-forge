import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

/**
 * Fallback mode when schema cannot be resolved
 */
export type FallbackMode = 'none' | 'loose' | 'warn';

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

  /**
   * Fail test execution if schema cannot be resolved
   * @default false
   */
  failOnMissingSchema?: boolean;

  /**
   * Fallback behavior when schema cannot be resolved
   * - 'none': Skip validation entirely
   * - 'loose': Validate only basic types (no schema enforcement)
   * - 'warn': Log warning and skip validation
   * @default 'warn'
   */
  fallbackMode?: FallbackMode;

  /**
   * Allow validation to proceed even if response status is not defined in spec
   * @default true
   */
  allowUnknownResponses?: boolean;

  /**
   * Allow validation to proceed even if $ref cannot be resolved
   * @default false
   */
  allowBrokenRefs?: boolean;

  /**
   * Warn only mode - log all errors but mark validation as passed
   * Useful for gradual OpenAPI spec adoption
   * @default false
   */
  warnOnly?: boolean;

  /**
   * Enable debug logging for resolution steps
   * @default false
   */
  debugResolution?: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  schema?: object;
  ajvErrors?: ErrorObject[] | null;
  path?: string;
  method?: string;
  status?: number | string;
  skipped?: boolean;
  fallbackUsed?: boolean;
  warnOnlyMode?: boolean;
}

/**
 * Default fallback schema for broken or missing schemas
 * Allows any object structure
 */
const DEFAULT_FALLBACK_SCHEMA = {
  type: 'object' as const,
  additionalProperties: true
};

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
   * @param allowBrokenRefs - Whether to allow broken $ref
   * @param debug - Enable debug logging
   */
  private async loadSpec(
    spec: string | object,
    useCache: boolean = true,
    allowBrokenRefs: boolean = false,
    debug: boolean = false
  ): Promise<any> {
    // If it's already an object, return it
    if (typeof spec === 'object') {
      return spec;
    }

    // Check cache
    const cacheKey = spec;
    if (useCache && specCache.has(cacheKey)) {
      if (debug) {
        console.log(`[OpenApiValidator] Using cached spec: ${cacheKey}`);
      }
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
    try {
      parsedSpec = this.resolveRefs(parsedSpec, undefined, allowBrokenRefs, debug);
    } catch (error: any) {
      if (allowBrokenRefs) {
        if (debug) {
          console.warn(`[OpenApiValidator] Failed to resolve all refs, continuing with partial spec: ${error.message}`);
        }
        // Continue with partially resolved spec
      } else {
        throw error;
      }
    }

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
  private resolveRefs(spec: any, root?: any, allowBrokenRefs: boolean = false, debug: boolean = false): any {
    if (!root) root = spec;

    if (typeof spec !== 'object' || spec === null) {
      return spec;
    }

    if (Array.isArray(spec)) {
      return spec.map(item => this.resolveRefs(item, root, allowBrokenRefs, debug));
    }

    // Handle $ref
    if (spec.$ref && typeof spec.$ref === 'string') {
      const refPath = spec.$ref.replace(/^#\//, '').split('/');
      let resolved = root;
      
      if (debug) {
        console.log(`[OpenApiValidator] Resolving $ref: ${spec.$ref}`);
      }

      for (const part of refPath) {
        resolved = resolved[part];
        if (!resolved) {
          if (allowBrokenRefs) {
            if (debug) {
              console.warn(`[OpenApiValidator] Failed to resolve $ref: ${spec.$ref} - using fallback`);
            }
            // Return a permissive schema as fallback
            return DEFAULT_FALLBACK_SCHEMA;
          }
          throw new Error(`Failed to resolve $ref: ${spec.$ref}`);
        }
      }
      
      if (debug) {
        console.log(`[OpenApiValidator] Successfully resolved $ref: ${spec.$ref}`);
      }
      
      // Recursively resolve the referenced object
      return this.resolveRefs(resolved, root, allowBrokenRefs, debug);
    }

    // Recursively process all properties
    const result: any = {};
    for (const key in spec) {
      result[key] = this.resolveRefs(spec[key], root, allowBrokenRefs, debug);
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
    status: number | string,
    options: {
      allowUnknownResponses?: boolean;
      debug?: boolean;
    } = {}
  ): { schema: object | null; warnings: string[] } {
    const warnings: string[] = [];
    const { allowUnknownResponses = true, debug = false } = options;

    if (debug) {
      console.log(`[OpenApiValidator] Extracting schema for ${method.toUpperCase()} ${apiPath} (${status})`);
    }

    // Check if paths exist
    const paths = spec.paths || {};
    if (Object.keys(paths).length === 0) {
      warnings.push('OpenAPI spec has no paths defined');
      return { schema: null, warnings };
    }

    // Check if path exists
    const pathItem = paths[apiPath];
    if (!pathItem) {
      warnings.push(`Path not found in OpenAPI spec: ${apiPath}`);
      return { schema: null, warnings };
    }

    if (debug) {
      console.log(`[OpenApiValidator] Found path: ${apiPath}`);
    }

    // Check if method exists
    const operation = pathItem[method.toLowerCase()];
    if (!operation) {
      warnings.push(`Method ${method} not found for path ${apiPath}`);
      return { schema: null, warnings };
    }

    if (debug) {
      console.log(`[OpenApiValidator] Found method: ${method}`);
    }

    // Check if responses exist
    const responses = operation.responses || {};
    if (Object.keys(responses).length === 0) {
      warnings.push(`No responses defined for ${method} ${apiPath}`);
      return { schema: null, warnings };
    }

    // Try to find response for status
    const statusStr = String(status);
    const response = responses[statusStr] || responses['default'];

    if (!response) {
      if (allowUnknownResponses) {
        warnings.push(`Status ${status} not found in responses for ${method} ${apiPath} - available: ${Object.keys(responses).join(', ')}`);
        return { schema: null, warnings };
      }
      warnings.push(`Status ${status} not found and allowUnknownResponses is false`);
      return { schema: null, warnings };
    }

    if (debug) {
      console.log(`[OpenApiValidator] Found response for status: ${statusStr}`);
    }

    // Check content
    const content = response.content || {};
    if (Object.keys(content).length === 0) {
      warnings.push(`No content defined for response ${method} ${apiPath} ${status}`);
      return { schema: null, warnings };
    }

    // Try to find JSON content
    // Prefer application/json, fallback to wildcard, or use first available
    const jsonContent = content['application/json'] || 
                        content['*/*'] || 
                        (Object.keys(content).length > 0 ? Object.values(content)[0] : null);

    if (!jsonContent) {
      warnings.push(`No JSON content found for ${method} ${apiPath} ${status}`);
      return { schema: null, warnings };
    }

    // Check schema
    if (!jsonContent.schema) {
      warnings.push(`No schema defined in content for ${method} ${apiPath} ${status}`);
      return { schema: null, warnings };
    }

    if (debug) {
      console.log(`[OpenApiValidator] Successfully extracted schema`);
    }

    return { schema: jsonContent.schema, warnings };
  }

  /**
   * Creates a loose validation schema that only checks basic types
   */
  private createLooseSchema(responseBody: unknown): object {
    const type = Array.isArray(responseBody) ? 'array' : typeof responseBody;
    
    if (type === 'array') {
      return {
        type: 'array',
        items: { type: 'object', additionalProperties: true }
      };
    } else if (type === 'object') {
      return {
        type: 'object',
        additionalProperties: true
      };
    }
    
    return { type };
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
      failOnMissingSchema = false,
      fallbackMode = 'warn',
      allowUnknownResponses = true,
      allowBrokenRefs = false,
      warnOnly = false,
      debugResolution = false,
    } = options;

    const warnings: string[] = [];

    try {
      // Load and parse the spec
      const parsedSpec = await this.loadSpec(spec, cacheSpec, allowBrokenRefs, debugResolution);

      // Extract the response schema
      const { schema, warnings: extractWarnings } = this.extractResponseSchema(
        parsedSpec,
        apiPath,
        method,
        status,
        { allowUnknownResponses, debug: debugResolution }
      );

      warnings.push(...extractWarnings);

      // Handle missing schema
      if (!schema) {
        const missingSchemaMsg = `Schema not found for ${method.toUpperCase()} ${apiPath} (${status})`;
        
        if (failOnMissingSchema) {
          return {
            valid: false,
            errors: [missingSchemaMsg],
            warnings,
            path: apiPath,
            method,
            status,
          };
        }

        // Apply fallback mode
        if (fallbackMode === 'none') {
          if (debugResolution) {
            console.log(`[OpenApiValidator] Skipping validation (fallbackMode: none)`);
          }
          return {
            valid: true,
            errors: [],
            warnings: [...warnings, missingSchemaMsg],
            path: apiPath,
            method,
            status,
            skipped: true,
          };
        } else if (fallbackMode === 'warn') {
          console.warn(`[OpenApiValidator] ${missingSchemaMsg}`);
          warnings.forEach(w => console.warn(`[OpenApiValidator] ${w}`));
          return {
            valid: true,
            errors: [],
            warnings: [...warnings, missingSchemaMsg],
            path: apiPath,
            method,
            status,
            skipped: true,
          };
        } else if (fallbackMode === 'loose') {
          // Create loose schema that just validates basic type
          const looseSchema = this.createLooseSchema(responseBody);
          if (debugResolution) {
            console.log(`[OpenApiValidator] Using loose fallback schema:`, looseSchema);
          }
          warnings.push('Using loose type-only validation as fallback');
          
          const validator = this.ajv.compile(looseSchema);
          const valid = validator(responseBody);
          
          return {
            valid,
            errors: valid ? [] : ['Basic type validation failed'],
            warnings: [...warnings, missingSchemaMsg],
            schema: looseSchema,
            path: apiPath,
            method,
            status,
            fallbackUsed: true,
          };
        }
      }

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

        // Warn only mode
        if (warnOnly) {
          console.warn(`[OpenApiValidator] Validation failed (warnOnly mode):`);
          errors.forEach(err => console.warn(`  - ${err}`));
          return {
            valid: true,
            errors: [],
            warnings: [...warnings, ...errors],
            schema: finalSchema,
            ajvErrors: validator.errors,
            path: apiPath,
            method,
            status,
            warnOnlyMode: true,
          };
        }

        return {
          valid: false,
          errors,
          warnings,
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
        warnings,
        schema: finalSchema,
        path: apiPath,
        method,
        status,
      };
    } catch (error: any) {
      const errorMsg = error.message || 'Validation error';
      
      if (warnOnly) {
        console.warn(`[OpenApiValidator] ${errorMsg} (warnOnly mode)`);
        return {
          valid: true,
          errors: [],
          warnings: [...warnings, errorMsg],
          path: apiPath,
          method,
          status,
          warnOnlyMode: true,
        };
      }

      return {
        valid: false,
        errors: [errorMsg],
        warnings,
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
