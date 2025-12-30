/**
 * CI Annotations Exporter
 * 
 * Exposes OpenAPI validation, drift, and coverage issues directly inside CI systems
 * (PR checks / job summaries), not only in logs.
 * 
 * Supported CI Providers: GitHub Actions, GitLab CI, CircleCI
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Annotation severity levels
 */
export type AnnotationSeverity = 'error' | 'warning' | 'notice';

/**
 * Annotation type categories
 */
export type AnnotationType = 
  | 'validation_error'
  | 'missing_schema'
  | 'broken_ref'
  | 'undocumented_endpoint'
  | 'coverage_threshold'
  | 'drift_warning';

/**
 * Core annotation structure
 */
export interface Annotation {
  type: AnnotationType;
  severity: AnnotationSeverity;
  message: string;
  file?: string;
  line?: number;
  endLine?: number;
  title?: string;
  context?: {
    method?: string;
    path?: string;
    status?: number;
    endpoint?: string;
  };
}

/**
 * CI Provider types
 */
export type CIProvider = 'github' | 'gitlab' | 'circleci' | 'auto' | 'none';

/**
 * Configuration for CI annotations
 */
export interface CIAnnotationsConfig {
  /**
   * Enable/disable annotations
   * @default true
   */
  enableAnnotations?: boolean;

  /**
   * CI provider to use
   * @default 'auto'
   */
  ciProvider?: CIProvider;

  /**
   * Mapping from annotation type to severity
   */
  severityMapping?: Partial<Record<AnnotationType, AnnotationSeverity>>;

  /**
   * Maximum number of annotations to emit
   * @default 50
   */
  maxAnnotations?: number;

  /**
   * Fail the build on errors
   * @default false
   */
  failOnError?: boolean;

  /**
   * Coverage threshold (0-100)
   * @default 80
   */
  coverageThreshold?: number;

  /**
   * Link to artifacts (coverage reports, etc.)
   */
  linkToArtifacts?: Record<string, string>;

  /**
   * Ignore rules for paths/methods
   */
  ignoreRules?: {
    paths?: string[];
    methods?: string[];
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<CIAnnotationsConfig> = {
  enableAnnotations: true,
  ciProvider: 'auto',
  severityMapping: {
    validation_error: 'error',
    missing_schema: 'warning',
    broken_ref: 'warning',
    undocumented_endpoint: 'notice',
    coverage_threshold: 'warning',
    drift_warning: 'notice',
  },
  maxAnnotations: 50,
  failOnError: false,
  coverageThreshold: 80,
  linkToArtifacts: {},
  ignoreRules: {
    paths: [],
    methods: [],
  },
};

/**
 * Abstract CI provider interface
 */
export abstract class CIProviderAdapter {
  protected config: Required<CIAnnotationsConfig>;

  constructor(config: CIAnnotationsConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if this provider is active in the current environment
   */
  abstract isActive(): boolean;

  /**
   * Emit annotations to the CI system
   */
  abstract emitAnnotations(annotations: Annotation[]): void;

  /**
   * Create a summary/report
   */
  abstract createSummary(annotations: Annotation[], stats: {
    total: number;
    errors: number;
    warnings: number;
    notices: number;
  }): void;
}

/**
 * GitHub Actions provider adapter
 */
export class GitHubActionsAdapter extends CIProviderAdapter {
  isActive(): boolean {
    return process.env.GITHUB_ACTIONS === 'true';
  }

  emitAnnotations(annotations: Annotation[]): void {
    for (const annotation of annotations) {
      const { severity, message, file, line, title } = annotation;
      
      let command = '';
      if (severity === 'error') {
        command = 'error';
      } else if (severity === 'warning') {
        command = 'warning';
      } else {
        command = 'notice';
      }

      let fileRef = '';
      if (file) {
        fileRef = `file=${file}`;
        if (line) {
          fileRef += `,line=${line}`;
          if (annotation.endLine) {
            fileRef += `,endLine=${annotation.endLine}`;
          }
        }
      }

      const titlePart = title ? `title=${title}` : '';
      const parts = [fileRef, titlePart].filter(p => p).join(',');
      const fullCommand = parts ? `::${command} ${parts}::${message}` : `::${command}::${message}`;
      
      console.log(fullCommand);
    }
  }

  createSummary(annotations: Annotation[], stats: { total: number; errors: number; warnings: number; notices: number }): void {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryFile) {
      console.log('\n=== OpenAPI Validation Summary ===');
      console.log(`Total Issues: ${stats.total}`);
      console.log(`Errors: ${stats.errors}, Warnings: ${stats.warnings}, Notices: ${stats.notices}`);
      return;
    }

    let summary = '## OpenAPI Validation Summary\n\n';
    summary += `- **Total Issues**: ${stats.total}\n`;
    summary += `- **Errors**: ${stats.errors}\n`;
    summary += `- **Warnings**: ${stats.warnings}\n`;
    summary += `- **Notices**: ${stats.notices}\n\n`;

    if (annotations.length > 0) {
      summary += '### Issues\n\n';
      summary += '| Severity | Type | Message | Context |\n';
      summary += '|----------|------|---------|----------|\n';
      
      for (const annotation of annotations.slice(0, 20)) {
        const severity = annotation.severity.toUpperCase();
        const type = annotation.type.replace(/_/g, ' ');
        const message = annotation.message.replace(/\|/g, '\\|').substring(0, 100);
        const context = annotation.context 
          ? `${annotation.context.method || ''} ${annotation.context.path || ''} ${annotation.context.status || ''}`.trim()
          : '';
        
        summary += `| ${severity} | ${type} | ${message} | ${context} |\n`;
      }

      if (annotations.length > 20) {
        summary += `\n*... and ${annotations.length - 20} more issues*\n`;
      }
    }

    // Append to summary file
    fs.appendFileSync(summaryFile, summary);
  }
}

/**
 * GitLab CI provider adapter
 */
export class GitLabCIAdapter extends CIProviderAdapter {
  isActive(): boolean {
    return process.env.GITLAB_CI === 'true';
  }

  emitAnnotations(annotations: Annotation[]): void {
    // GitLab uses Code Quality reports (JSON format)
    // Output to console for now with special formatting
    for (const annotation of annotations) {
      const { severity, message, file, line } = annotation;
      
      const location = file && line ? `${file}:${line}` : 'general';
      console.log(`[${severity.toUpperCase()}] ${location}: ${message}`);
    }
  }

  createSummary(annotations: Annotation[], stats: { total: number; errors: number; warnings: number; notices: number }): void {
    // GitLab summary in console
    console.log('\n========================================');
    console.log('OpenAPI Validation Summary');
    console.log('========================================');
    console.log(`Total Issues: ${stats.total}`);
    console.log(`  Errors:   ${stats.errors}`);
    console.log(`  Warnings: ${stats.warnings}`);
    console.log(`  Notices:  ${stats.notices}`);
    console.log('========================================\n');

    // Generate Code Quality report if in GitLab CI
    if (process.env.CI_PROJECT_DIR) {
      const report = annotations.map(a => ({
        description: a.message,
        severity: a.severity === 'error' ? 'major' : a.severity === 'warning' ? 'minor' : 'info',
        location: {
          path: a.file || 'openapi.yaml',
          lines: {
            begin: a.line || 1,
          },
        },
        fingerprint: this.generateFingerprint(a),
      }));

      const reportPath = path.join(process.env.CI_PROJECT_DIR, 'gl-code-quality-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`Code Quality report written to: ${reportPath}`);
    }
  }

  private generateFingerprint(annotation: Annotation): string {
    const str = `${annotation.type}-${annotation.message}-${annotation.file}-${annotation.line}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * CircleCI provider adapter
 */
export class CircleCIAdapter extends CIProviderAdapter {
  isActive(): boolean {
    return process.env.CIRCLECI === 'true';
  }

  emitAnnotations(annotations: Annotation[]): void {
    // CircleCI doesn't have native annotation support, use structured console output
    for (const annotation of annotations) {
      const { severity, message, file, line, context } = annotation;
      
      const prefix = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';
      const location = file && line ? ` [${file}:${line}]` : '';
      const contextStr = context ? ` (${context.method} ${context.path} ${context.status})` : '';
      
      console.log(`${prefix} ${severity.toUpperCase()}${location}: ${message}${contextStr}`);
    }
  }

  createSummary(annotations: Annotation[], stats: { total: number; errors: number; warnings: number; notices: number }): void {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  OpenAPI Validation Summary            ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║  Total Issues: ${stats.total.toString().padEnd(22)}║`);
    console.log(`║  ❌ Errors:    ${stats.errors.toString().padEnd(22)}║`);
    console.log(`║  ⚠️  Warnings:  ${stats.warnings.toString().padEnd(22)}║`);
    console.log(`║  ℹ️  Notices:   ${stats.notices.toString().padEnd(22)}║`);
    console.log('╚════════════════════════════════════════╝\n');

    // Create artifacts directory if needed
    const artifactsDir = process.env.CIRCLE_ARTIFACTS || '/tmp/circle-artifacts';
    if (fs.existsSync(artifactsDir) || process.env.CIRCLE_ARTIFACTS) {
      try {
        if (!fs.existsSync(artifactsDir)) {
          fs.mkdirSync(artifactsDir, { recursive: true });
        }
        
        const reportPath = path.join(artifactsDir, 'openapi-validation-report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
          summary: stats,
          annotations: annotations,
        }, null, 2));
        
        console.log(`📊 Full report saved to: ${reportPath}`);
      } catch (error) {
        // Graceful degradation
        console.log('Note: Could not write artifact file');
      }
    }
  }
}

/**
 * Core CI Annotations Exporter
 */
export class CIAnnotationsExporter {
  private annotations: Annotation[] = [];
  private config: Required<CIAnnotationsConfig>;
  private adapter: CIProviderAdapter;

  constructor(config: CIAnnotationsConfig = {}) {
    const ignoreMethods = (config.ignoreRules?.methods || DEFAULT_CONFIG.ignoreRules.methods || []).map(m => m.toLowerCase());
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      severityMapping: {
        ...DEFAULT_CONFIG.severityMapping,
        ...config.severityMapping,
      },
      linkToArtifacts: {
        ...DEFAULT_CONFIG.linkToArtifacts,
        ...config.linkToArtifacts,
      },
      ignoreRules: {
        paths: config.ignoreRules?.paths || DEFAULT_CONFIG.ignoreRules.paths || [],
        methods: ignoreMethods,
      },
    };
    this.adapter = this.selectAdapter();
  }

  /**
   * Select the appropriate CI provider adapter
   */
  private selectAdapter(): CIProviderAdapter {
    if (!this.config.enableAnnotations) {
      return new NoOpAdapter(this.config);
    }

    if (this.config.ciProvider === 'auto') {
      // Auto-detect
      if (new GitHubActionsAdapter(this.config).isActive()) {
        return new GitHubActionsAdapter(this.config);
      } else if (new GitLabCIAdapter(this.config).isActive()) {
        return new GitLabCIAdapter(this.config);
      } else if (new CircleCIAdapter(this.config).isActive()) {
        return new CircleCIAdapter(this.config);
      }
      return new NoOpAdapter(this.config);
    }

    // Manual selection
    switch (this.config.ciProvider) {
      case 'github':
        return new GitHubActionsAdapter(this.config);
      case 'gitlab':
        return new GitLabCIAdapter(this.config);
      case 'circleci':
        return new CircleCIAdapter(this.config);
      default:
        return new NoOpAdapter(this.config);
    }
  }

  /**
   * Add an annotation
   */
  addAnnotation(annotation: Annotation): void {
    // Apply severity mapping
    const mappedSeverity = this.config.severityMapping[annotation.type] || annotation.severity;
    
    // Check ignore rules
    if (this.shouldIgnore(annotation)) {
      return;
    }

    this.annotations.push({
      ...annotation,
      severity: mappedSeverity,
    });
  }

  /**
   * Check if annotation should be ignored
   */
  private shouldIgnore(annotation: Annotation): boolean {
    const { context } = annotation;
    if (!context) return false;

    const { paths, methods } = this.config.ignoreRules;
    
    if (context.path && paths?.some(p => context.path === p || context.path?.startsWith(p))) {
      return true;
    }

    if (context.method && methods?.includes(context.method.toLowerCase())) {
      return true;
    }

    return false;
  }

  /**
   * Deduplicate annotations
   */
  private deduplicateAnnotations(): Annotation[] {
    const seen = new Set<string>();
    const unique: Annotation[] = [];

    for (const annotation of this.annotations) {
      const key = `${annotation.type}-${annotation.severity}-${annotation.message}-${annotation.context?.method}-${annotation.context?.path}-${annotation.context?.status}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(annotation);
      }
    }

    return unique;
  }

  /**
   * Export annotations to CI system
   */
  export(): void {
    if (!this.config.enableAnnotations || this.annotations.length === 0) {
      return;
    }

    // Deduplicate
    const unique = this.deduplicateAnnotations();

    // Limit annotations
    const limited = unique.slice(0, this.config.maxAnnotations);

    // Calculate stats
    const stats = {
      total: limited.length,
      errors: limited.filter(a => a.severity === 'error').length,
      warnings: limited.filter(a => a.severity === 'warning').length,
      notices: limited.filter(a => a.severity === 'notice').length,
    };

    // Emit annotations
    this.adapter.emitAnnotations(limited);

    // Create summary
    this.adapter.createSummary(limited, stats);

    // Fail on error if configured
    if (this.config.failOnError && stats.errors > 0) {
      throw new Error(`CI Annotations: ${stats.errors} error(s) found`);
    }
  }

  /**
   * Get current annotations
   */
  getAnnotations(): Annotation[] {
    return [...this.annotations];
  }

  /**
   * Clear all annotations
   */
  clear(): void {
    this.annotations = [];
  }

  /**
   * Get detected CI provider
   */
  getDetectedProvider(): string {
    if (this.adapter instanceof GitHubActionsAdapter) return 'github';
    if (this.adapter instanceof GitLabCIAdapter) return 'gitlab';
    if (this.adapter instanceof CircleCIAdapter) return 'circleci';
    return 'none';
  }
}

/**
 * No-op adapter for when annotations are disabled or no CI is detected
 */
class NoOpAdapter extends CIProviderAdapter {
  isActive(): boolean {
    return false;
  }

  emitAnnotations(_annotations: Annotation[]): void {
    // No-op
  }

  createSummary(_annotations: Annotation[], _stats: { total: number; errors: number; warnings: number; notices: number }): void {
    // No-op
  }
}

/**
 * Helper function to create validation error annotation
 */
export function createValidationErrorAnnotation(
  message: string,
  context: { method?: string; path?: string; status?: number },
  file?: string,
  line?: number
): Annotation {
  return {
    type: 'validation_error',
    severity: 'error',
    message,
    context,
    file,
    line,
    title: 'OpenAPI Validation Error',
  };
}

/**
 * Helper function to create drift warning annotation
 */
export function createDriftWarningAnnotation(
  message: string,
  context: { method?: string; path?: string; status?: number },
  file?: string,
  line?: number
): Annotation {
  return {
    type: 'drift_warning',
    severity: 'notice',
    message,
    context,
    file,
    line,
    title: 'OpenAPI Drift Detected',
  };
}

/**
 * Helper function to create undocumented endpoint annotation
 */
export function createUndocumentedEndpointAnnotation(
  message: string,
  context: { method?: string; path?: string },
  file?: string,
  line?: number
): Annotation {
  return {
    type: 'undocumented_endpoint',
    severity: 'notice',
    message,
    context,
    file,
    line,
    title: 'Undocumented Endpoint',
  };
}
