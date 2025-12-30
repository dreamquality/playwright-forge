import * as YAML from 'yaml';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Loads and parses a YAML file
 * @param filePath - Path to the YAML file
 * @returns Parsed YAML content
 */
export function loadYaml<T = any>(filePath: string): T {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(process.cwd(), filePath);
  
  const content = fs.readFileSync(absolutePath, 'utf-8');
  return YAML.parse(content);
}

/**
 * Loads and parses a YAML file asynchronously
 * @param filePath - Path to the YAML file
 * @returns Parsed YAML content
 */
export async function loadYamlAsync<T = any>(filePath: string): Promise<T> {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(process.cwd(), filePath);
  
  const content = await fs.promises.readFile(absolutePath, 'utf-8');
  return YAML.parse(content);
}

/**
 * Saves data as YAML to a file
 * @param filePath - Path to save the YAML file
 * @param data - Data to serialize as YAML
 */
export function saveYaml(filePath: string, data: any): void {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(process.cwd(), filePath);
  
  const yamlContent = YAML.stringify(data);
  fs.writeFileSync(absolutePath, yamlContent, 'utf-8');
}

/**
 * Saves data as YAML to a file asynchronously
 * @param filePath - Path to save the YAML file
 * @param data - Data to serialize as YAML
 */
export async function saveYamlAsync(filePath: string, data: any): Promise<void> {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(process.cwd(), filePath);
  
  const yamlContent = YAML.stringify(data);
  await fs.promises.writeFile(absolutePath, yamlContent, 'utf-8');
}
