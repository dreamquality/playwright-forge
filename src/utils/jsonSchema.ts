import Ajv, { JSONSchemaType, ValidateFunction } from 'ajv';

const ajv = new Ajv({ allErrors: true });

/**
 * Validates JSON data against a JSON schema
 * @param data - The data to validate
 * @param schema - The JSON schema to validate against
 * @returns Validation result with errors if any
 */
export function validateJsonSchema<T = any>(
  data: unknown,
  schema: JSONSchemaType<T> | object
): { valid: boolean; errors: string[] } {
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (!valid && validate.errors) {
    const errors = validate.errors.map(
      (err) => `${err.instancePath} ${err.message}`
    );
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Creates a reusable validator function for a specific schema
 * @param schema - The JSON schema
 * @returns A validator function
 */
export function createValidator<T = any>(
  schema: JSONSchemaType<T> | object
): ValidateFunction<T> {
  return ajv.compile(schema) as ValidateFunction<T>;
}

/**
 * Validates and throws an error if validation fails
 * @param data - The data to validate
 * @param schema - The JSON schema to validate against
 * @throws Error with validation details if validation fails
 */
export function assertJsonSchema<T = any>(
  data: unknown,
  schema: JSONSchemaType<T> | object
): asserts data is T {
  const result = validateJsonSchema(data, schema);
  if (!result.valid) {
    throw new Error(`JSON Schema validation failed:\n${result.errors.join('\n')}`);
  }
}
