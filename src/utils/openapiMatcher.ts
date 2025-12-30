import { APIResponse } from '@playwright/test';
import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

/**
 * Cache entry for OpenAPI specs
 */
interface CacheEntry {
  spec: any;
  timestamp: number;
}

/**
 * OpenAPI matcher configuration
 */
export interface OpenApiMatcherConfig {
  /**
   * OpenAPI specification source
   * Can be a URL, file path, or already loaded object
   */
  spec: string | object;

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
   * Custom path resolver for matching templated paths
   * @param templatePath - OpenAPI path template (e.g., '/users/{id}')
   * @param actualPath - Actual request path (e.g., '/users/123')
   * @returns true if paths match
   */
  pathResolver?: (templatePath: string, actualPath: string) => boolean;

  /**
   * Enable spec caching
   * @default true
   */
  enableCache?: boolean;

  /**
   * Cache TTL in milliseconds (0 = no expiration)
   * @default 0
   */
  cacheTTL?: number;

  /**
   * Custom error formatter
   * @param errors - AJV errors
   * @param context - Validation context
   * @returns Formatted error message
   */
  errorFormatter?: (errors: ErrorObject[], context: ValidationContext) => string;

  /**
   * Enable debug mode for verbose logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Validation context for error formatting
 */
export interface ValidationContext {
  method: string;
  path: string;
  status: number;
  schema?: object;
  responseBody: unknown;
}

/**
 * Validation result for matcher
 */
export interface MatcherValidationResult {
  valid: boolean;
  message: string;
  errors?: ErrorObject[];
  schema?: object;
  context?: ValidationContext;
}

/**
 * Per-worker in-memory cache for OpenAPI specs
 */
class SpecCache {
  private cache = new Map<string, CacheEntry>();

  get(key: string, ttl: number = 0): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (ttl > 0 && Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.spec;
  }

  set(key: string, spec: any): void {
    this.cache.set(key, {
      spec,
      timestamp: Date.now(),
    });
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  size(): number {
    return this.cache.size;
  }
}

// Global cache instance (per-worker)
const globalSpecCache = new SpecCache();

/**
 * Enhanced OpenAPI matcher for Playwright responses
 */
export class OpenApiMatcher {
  private ajv: Ajv;
  private config: Required<Omit<OpenApiMatcherConfig, 'spec' | 'pathResolver' | 'errorFormatter'>> & 
    Pick<OpenApiMatcherConfig, 'pathResolver' | 'errorFormatter'>;

  constructor(config: Partial<OpenApiMatcherConfig> = {}) {
    this.config = {
      strict: config.strict ?? false,
      allowAdditionalProperties: config.allowAdditionalProperties ?? true,
      ajvOptions: config.ajvOptions ?? {},
      enableCache: config.enableCache ?? true,
      cacheTTL: config.cacheTTL ?? 0,
      debug: config.debug ?? false,
      pathResolver: config.pathResolver,
      errorFormatter: config.errorFormatter,
    };

    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateFormats: true,
      ...this.config.ajvOptions,
    });
    addFormats(this.ajv);
  }

  /**
   * Auto-detect method, path, and status from Playwright response
   */
  private extractResponseMetadata(response: APIResponse): {
    method: string;
    path: string;
    status: number;
    url: string;
  } {
    const url = response.url();
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const status = response.status();
    
    // Extract method from response
    // Playwright doesn't expose the request method directly, so we'll need to infer or allow override
    // For now, we'll try to get it from the response headers or default to GET
    const method = this.inferMethodFromResponse(response);

    return { method, path, status, url };
  }

  /**
   * Infer HTTP method from response
   * Note: Playwright APIResponse doesn't directly expose the request method
   * This is a best-effort approach
   */
  private inferMethodFromResponse(response: APIResponse): string {
    // Check common patterns in headers or response
    const statusCode = response.status();
    
    // Common patterns:
    // 201 = POST
    // 204 = DELETE/PUT
    if (statusCode === 201) return 'post';
    if (statusCode === 204) return 'delete';
    
    // Default to GET for most read operations
    return 'get';
  }

  /**
   * Match actual path to OpenAPI template path
   */
  private matchPath(templatePath: string, actualPath: string): boolean {
    if (this.config.pathResolver) {
      return this.config.pathResolver(templatePath, actualPath);
    }

    // Default path matching logic
    // Convert OpenAPI path template to regex
    // e.g., '/users/{id}' -> '/users/[^/]+'
    const regexPattern = templatePath
      .replace(/\{[^}]+\}/g, '[^/]+')
      .replace(/\//g, '\\/');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(actualPath);
  }

  /**
   * Find matching OpenAPI path in spec
   */
  private findMatchingPath(spec: any, actualPath: string): string | null {
    const paths = spec.paths || {};
    
    for (const templatePath of Object.keys(paths)) {
      if (this.matchPath(templatePath, actualPath)) {
        return templatePath;
      }
    }
    
    return null;
  }

  /**
   * Load OpenAPI spec from various sources
   */
  private async loadSpec(spec: string | object): Promise<any> {
    // If it's already an object, return it
    if (typeof spec === 'object') {
      return spec;
    }

    // Check cache
    const cacheKey = spec;
    if (this.config.enableCache) {
      const cached = globalSpecCache.get(cacheKey, this.config.cacheTTL);
      if (cached) {
        if (this.config.debug) {
          console.log(`[OpenApiMatcher] Using cached spec for: ${cacheKey}`);
        }
        return cached;
      }
    }

    // Load spec
    let parsedSpec: any;
    if (spec.startsWith('http://') || spec.startsWith('https://')) {
      parsedSpec = await this.loadSpecFromUrl(spec);
    } else {
      parsedSpec = await this.loadSpecFromFile(spec);
    }

    // Resolve $ref
    parsedSpec = this.resolveRefs(parsedSpec);

    // Cache the spec
    if (this.config.enableCache) {
      globalSpecCache.set(cacheKey, parsedSpec);
      if (this.config.debug) {
        console.log(`[OpenApiMatcher] Cached spec: ${cacheKey}`);
      }
    }

    return parsedSpec;
  }

  /**
   * Load spec from URL
   */
  private async loadSpecFromUrl(url: string): Promise<any> {
    if (this.config.debug) {
      console.log(`[OpenApiMatcher] Loading spec from URL: ${url}`);
    }

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
   * Load spec from file
   */
  private async loadSpecFromFile(filePath: string): Promise<any> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    if (this.config.debug) {
      console.log(`[OpenApiMatcher] Loading spec from file: ${absolutePath}`);
    }

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
   * Resolve $ref references
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
   * Extract response schema
   */
  private extractResponseSchema(
    spec: any,
    apiPath: string,
    method: string,
    status: number
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
   * Set additionalProperties recursively
   */
  private setAdditionalProperties(schema: any, value: boolean): any {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    if (Array.isArray(schema)) {
      return schema.map(item => this.setAdditionalProperties(item, value));
    }

    const result: any = { ...schema };

    if (result.type === 'object' || result.additionalProperties !== undefined) {
      result.additionalProperties = value;
    }

    if (result.properties) {
      result.properties = Object.keys(result.properties).reduce((acc: any, key: string) => {
        acc[key] = this.setAdditionalProperties(result.properties[key], value);
        return acc;
      }, {});
    }

    if (result.items) {
      result.items = this.setAdditionalProperties(result.items, value);
    }

    ['allOf', 'anyOf', 'oneOf'].forEach(keyword => {
      if (result[keyword]) {
        result[keyword] = result[keyword].map((s: any) => this.setAdditionalProperties(s, value));
      }
    });

    return result;
  }

  /**
   * Format validation errors
   */
  private formatErrors(errors: ErrorObject[], context: ValidationContext): string {
    if (this.config.errorFormatter) {
      return this.config.errorFormatter(errors, context);
    }

    // Default error formatting
    const errorLines = errors.map(err => {
      const pathStr = err.instancePath || 'root';
      const message = err.message || 'validation failed';
      const params = err.params ? ` (${JSON.stringify(err.params)})` : '';
      return `  - ${pathStr}: ${message}${params}`;
    });

    return [
      `OpenAPI validation failed for ${context.method.toUpperCase()} ${context.path} (${context.status})`,
      '',
      'Errors:',
      ...errorLines,
    ].join('\n');
  }

  /**
   * Validate Playwright response against OpenAPI spec
   */
  async validateResponse(
    response: APIResponse,
    spec: string | object,
    overrides?: {
      method?: string;
      path?: string;
      status?: number;
    }
  ): Promise<MatcherValidationResult> {
    try {
      // Extract metadata from response
      const metadata = this.extractResponseMetadata(response);
      
      // Apply overrides if provided
      const method = overrides?.method || metadata.method;
      const actualPath = overrides?.path || metadata.path;
      const status = overrides?.status || metadata.status;

      if (this.config.debug) {
        console.log(`[OpenApiMatcher] Validating: ${method.toUpperCase()} ${actualPath} (${status})`);
      }

      // Load spec
      const parsedSpec = await this.loadSpec(spec);

      // Find matching OpenAPI path
      const matchingPath = this.findMatchingPath(parsedSpec, actualPath);
      if (!matchingPath) {
        return {
          valid: false,
          message: `No matching path found in OpenAPI spec for: ${actualPath}`,
        };
      }

      if (this.config.debug) {
        console.log(`[OpenApiMatcher] Matched OpenAPI path: ${matchingPath}`);
      }

      // Extract schema
      const schema = this.extractResponseSchema(parsedSpec, matchingPath, method, status);

      // Modify schema based on config
      let finalSchema = { ...schema };
      if (this.config.strict) {
        finalSchema = this.setAdditionalProperties(finalSchema, false);
      } else if (this.config.allowAdditionalProperties) {
        finalSchema = this.setAdditionalProperties(finalSchema, true);
      }

      // Get response body
      const responseBody = await response.json();

      // Validate
      const validator = this.ajv.compile(finalSchema);
      const valid = validator(responseBody);

      const context: ValidationContext = {
        method,
        path: matchingPath,
        status,
        schema: finalSchema,
        responseBody,
      };

      if (!valid && validator.errors) {
        return {
          valid: false,
          message: this.formatErrors(validator.errors, context),
          errors: validator.errors,
          schema: finalSchema,
          context,
        };
      }

      return {
        valid: true,
        message: `Response matches OpenAPI schema for ${method.toUpperCase()} ${matchingPath} (${status})`,
        schema: finalSchema,
        context,
      };
    } catch (error: any) {
      return {
        valid: false,
        message: error.message || 'Validation error',
      };
    }
  }

  /**
   * Clear cache
   */
  static clearCache(key?: string): void {
    globalSpecCache.clear(key);
  }

  /**
   * Get cache size
   */
  static getCacheSize(): number {
    return globalSpecCache.size();
  }
}

/**
 * Create an expectation matcher for Playwright responses
 */
export function expectApiResponse(response: APIResponse) {
  return {
    /**
     * One-liner API to validate response against OpenAPI schema
     * Automatically detects method, path, and status from response
     */
    async toMatchOpenApiSchema(
      config: OpenApiMatcherConfig & { method?: string; path?: string; status?: number }
    ): Promise<MatcherValidationResult> {
      const { spec, method, path, status, ...matcherConfig } = config;
      
      if (!spec) {
        throw new Error('OpenAPI spec is required');
      }

      const matcher = new OpenApiMatcher(matcherConfig);
      return matcher.validateResponse(response, spec, { method, path, status });
    },
  };
}
