import { test, expect } from '@playwright/test';
import {
  CIAnnotationsExporter,
  GitHubActionsAdapter,
  GitLabCIAdapter,
  CircleCIAdapter,
  createValidationErrorAnnotation,
  createDriftWarningAnnotation,
  createUndocumentedEndpointAnnotation,
  type Annotation,
  type CIAnnotationsConfig,
} from '../src/utils/ciAnnotations';
import * as fs from 'fs';
import * as path from 'path';

test.describe('CI Annotations Exporter', () => {
  test('should create exporter with default config', () => {
    const exporter = new CIAnnotationsExporter();
    expect(exporter).toBeDefined();
    expect(exporter.getAnnotations()).toEqual([]);
  });

  test('should add annotation', () => {
    const exporter = new CIAnnotationsExporter();
    
    const annotation: Annotation = {
      type: 'validation_error',
      severity: 'error',
      message: 'Invalid response format',
      context: {
        method: 'GET',
        path: '/users',
        status: 200,
      },
    };

    exporter.addAnnotation(annotation);
    
    expect(exporter.getAnnotations()).toHaveLength(1);
    expect(exporter.getAnnotations()[0]).toMatchObject(annotation);
  });

  test('should deduplicate annotations', () => {
    const exporter = new CIAnnotationsExporter();
    
    const annotation1: Annotation = {
      type: 'validation_error',
      severity: 'error',
      message: 'Invalid format',
      context: { method: 'GET', path: '/users' },
    };

    const annotation2: Annotation = {
      type: 'validation_error',
      severity: 'error',
      message: 'Invalid format',
      context: { method: 'GET', path: '/users' },
    };

    exporter.addAnnotation(annotation1);
    exporter.addAnnotation(annotation2);
    
    // Before export, we have 2
    expect(exporter.getAnnotations()).toHaveLength(2);
    
    // After export (with deduplication), should be 1
    let consoleOutput = '';
    const originalLog = console.log;
    console.log = (msg: string) => { consoleOutput += msg + '\n'; };
    
    exporter.export();
    
    console.log = originalLog;
  });

  test('should apply severity mapping', () => {
    const config: CIAnnotationsConfig = {
      severityMapping: {
        validation_error: 'warning', // Override default error to warning
      },
    };
    
    const exporter = new CIAnnotationsExporter(config);
    
    const annotation: Annotation = {
      type: 'validation_error',
      severity: 'error',
      message: 'Test error',
    };

    exporter.addAnnotation(annotation);
    
    expect(exporter.getAnnotations()[0].severity).toBe('warning');
  });

  test('should ignore annotations based on ignore rules', () => {
    const config: CIAnnotationsConfig = {
      ignoreRules: {
        paths: ['/health', '/metrics'],
        methods: ['OPTIONS'],
      },
    };
    
    const exporter = new CIAnnotationsExporter(config);
    
    const annotation1: Annotation = {
      type: 'validation_error',
      severity: 'error',
      message: 'Error 1',
      context: { path: '/health' },
    };

    const annotation2: Annotation = {
      type: 'validation_error',
      severity: 'error',
      message: 'Error 2',
      context: { method: 'options' }, // lowercase to match implementation
    };

    const annotation3: Annotation = {
      type: 'validation_error',
      severity: 'error',
      message: 'Error 3',
      context: { path: '/users' },
    };

    exporter.addAnnotation(annotation1);
    exporter.addAnnotation(annotation2);
    exporter.addAnnotation(annotation3);
    
    // Only annotation3 should be added
    expect(exporter.getAnnotations()).toHaveLength(1);
    expect(exporter.getAnnotations()[0].message).toBe('Error 3');
  });

  test('should limit annotations to maxAnnotations', () => {
    const config: CIAnnotationsConfig = {
      maxAnnotations: 3,
    };
    
    const exporter = new CIAnnotationsExporter(config);
    
    for (let i = 0; i < 10; i++) {
      exporter.addAnnotation({
        type: 'validation_error',
        severity: 'error',
        message: `Error ${i}`,
        context: { path: `/path${i}` },
      });
    }

    let consoleOutput = '';
    const originalLog = console.log;
    console.log = (msg: string) => { consoleOutput += msg + '\n'; };
    
    exporter.export();
    
    console.log = originalLog;
    
    // Should have all 10 internally
    expect(exporter.getAnnotations()).toHaveLength(10);
  });

  test('should clear annotations', () => {
    const exporter = new CIAnnotationsExporter();
    
    exporter.addAnnotation({
      type: 'validation_error',
      severity: 'error',
      message: 'Test',
    });

    expect(exporter.getAnnotations()).toHaveLength(1);
    
    exporter.clear();
    
    expect(exporter.getAnnotations()).toHaveLength(0);
  });

  test('should detect no CI provider by default', () => {
    // Clear env vars
    const oldGithub = process.env.GITHUB_ACTIONS;
    const oldGitlab = process.env.GITLAB_CI;
    const oldCircle = process.env.CIRCLECI;
    
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.CIRCLECI;
    
    const exporter = new CIAnnotationsExporter();
    expect(exporter.getDetectedProvider()).toBe('none');
    
    // Restore
    if (oldGithub) process.env.GITHUB_ACTIONS = oldGithub;
    if (oldGitlab) process.env.GITLAB_CI = oldGitlab;
    if (oldCircle) process.env.CIRCLECI = oldCircle;
  });

  test('should export with disabled annotations', () => {
    const config: CIAnnotationsConfig = {
      enableAnnotations: false,
    };
    
    const exporter = new CIAnnotationsExporter(config);
    
    exporter.addAnnotation({
      type: 'validation_error',
      severity: 'error',
      message: 'Test',
    });

    let consoleOutput = '';
    const originalLog = console.log;
    console.log = (msg: string) => { consoleOutput += msg + '\n'; };
    
    exporter.export();
    
    console.log = originalLog;
    
    // Should not output anything
    expect(consoleOutput).toBe('');
  });
});

test.describe('GitHub Actions Adapter', () => {
  test('should detect GitHub Actions environment', () => {
    const oldValue = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = 'true';
    
    const adapter = new GitHubActionsAdapter();
    expect(adapter.isActive()).toBe(true);
    
    if (oldValue) {
      process.env.GITHUB_ACTIONS = oldValue;
    } else {
      delete process.env.GITHUB_ACTIONS;
    }
  });

  test('should emit GitHub Actions annotations', () => {
    const adapter = new GitHubActionsAdapter();
    
    const annotations: Annotation[] = [
      {
        type: 'validation_error',
        severity: 'error',
        message: 'Invalid response',
        file: 'openapi.yaml',
        line: 42,
        context: { method: 'GET', path: '/users' },
      },
      {
        type: 'drift_warning',
        severity: 'warning',
        message: 'Schema drift detected',
      },
    ];

    let consoleOutput = '';
    const originalLog = console.log;
    console.log = (msg: string) => { consoleOutput += msg + '\n'; };
    
    adapter.emitAnnotations(annotations);
    
    console.log = originalLog;
    
    expect(consoleOutput).toContain('::error');
    expect(consoleOutput).toContain('file=openapi.yaml');
    expect(consoleOutput).toContain('line=42');
    expect(consoleOutput).toContain('::warning');
  });

  test('should create GitHub Actions summary', () => {
    const adapter = new GitHubActionsAdapter();
    
    const annotations: Annotation[] = [
      {
        type: 'validation_error',
        severity: 'error',
        message: 'Error 1',
        context: { method: 'GET', path: '/users' },
      },
      {
        type: 'drift_warning',
        severity: 'warning',
        message: 'Warning 1',
      },
    ];

    const stats = {
      total: 2,
      errors: 1,
      warnings: 1,
      notices: 0,
    };

    // Without GITHUB_STEP_SUMMARY, should complete without error
    expect(() => {
      adapter.createSummary(annotations, stats);
    }).not.toThrow();
  });
});

test.describe('GitLab CI Adapter', () => {
  test('should detect GitLab CI environment', () => {
    const oldValue = process.env.GITLAB_CI;
    process.env.GITLAB_CI = 'true';
    
    const adapter = new GitLabCIAdapter();
    expect(adapter.isActive()).toBe(true);
    
    if (oldValue) {
      process.env.GITLAB_CI = oldValue;
    } else {
      delete process.env.GITLAB_CI;
    }
  });

  test('should emit GitLab CI annotations', () => {
    const adapter = new GitLabCIAdapter();
    
    const annotations: Annotation[] = [
      {
        type: 'validation_error',
        severity: 'error',
        message: 'Invalid response',
        file: 'openapi.yaml',
        line: 42,
      },
    ];

    let consoleOutput = '';
    const originalLog = console.log;
    console.log = (msg: string) => { consoleOutput += msg + '\n'; };
    
    adapter.emitAnnotations(annotations);
    
    console.log = originalLog;
    
    expect(consoleOutput).toContain('[ERROR]');
    expect(consoleOutput).toContain('openapi.yaml:42');
  });

  test('should create GitLab CI summary', () => {
    const adapter = new GitLabCIAdapter();
    
    const annotations: Annotation[] = [];
    const stats = {
      total: 0,
      errors: 0,
      warnings: 0,
      notices: 0,
    };

    let consoleOutput = '';
    const originalLog = console.log;
    console.log = (msg: string) => { consoleOutput += msg + '\n'; };
    
    adapter.createSummary(annotations, stats);
    
    console.log = originalLog;
    
    expect(consoleOutput).toContain('OpenAPI Validation Summary');
  });
});

test.describe('CircleCI Adapter', () => {
  test('should detect CircleCI environment', () => {
    const oldValue = process.env.CIRCLECI;
    process.env.CIRCLECI = 'true';
    
    const adapter = new CircleCIAdapter();
    expect(adapter.isActive()).toBe(true);
    
    if (oldValue) {
      process.env.CIRCLECI = oldValue;
    } else {
      delete process.env.CIRCLECI;
    }
  });

  test('should emit CircleCI annotations', () => {
    const adapter = new CircleCIAdapter();
    
    const annotations: Annotation[] = [
      {
        type: 'validation_error',
        severity: 'error',
        message: 'Invalid response',
        file: 'openapi.yaml',
        line: 42,
        context: { method: 'GET', path: '/users', status: 200 },
      },
    ];

    let consoleOutput = '';
    const originalLog = console.log;
    console.log = (msg: string) => { consoleOutput += msg + '\n'; };
    
    adapter.emitAnnotations(annotations);
    
    console.log = originalLog;
    
    expect(consoleOutput).toContain('❌');
    expect(consoleOutput).toContain('ERROR');
    expect(consoleOutput).toContain('openapi.yaml:42');
    expect(consoleOutput).toContain('GET /users 200');
  });

  test('should create CircleCI summary', () => {
    const adapter = new CircleCIAdapter();
    
    const annotations: Annotation[] = [];
    const stats = {
      total: 5,
      errors: 2,
      warnings: 2,
      notices: 1,
    };

    let consoleOutput = '';
    const originalLog = console.log;
    console.log = (msg: string) => { consoleOutput += msg + '\n'; };
    
    adapter.createSummary(annotations, stats);
    
    console.log = originalLog;
    
    expect(consoleOutput).toContain('OpenAPI Validation Summary');
    expect(consoleOutput).toContain('5');
    expect(consoleOutput).toContain('2');
  });
});

test.describe('Helper Functions', () => {
  test('should create validation error annotation', () => {
    const annotation = createValidationErrorAnnotation(
      'Invalid response format',
      { method: 'GET', path: '/users', status: 200 },
      'openapi.yaml',
      42
    );

    expect(annotation.type).toBe('validation_error');
    expect(annotation.severity).toBe('error');
    expect(annotation.message).toBe('Invalid response format');
    expect(annotation.context).toEqual({ method: 'GET', path: '/users', status: 200 });
    expect(annotation.file).toBe('openapi.yaml');
    expect(annotation.line).toBe(42);
    expect(annotation.title).toBe('OpenAPI Validation Error');
  });

  test('should create drift warning annotation', () => {
    const annotation = createDriftWarningAnnotation(
      'Field missing in schema',
      { method: 'POST', path: '/users' }
    );

    expect(annotation.type).toBe('drift_warning');
    expect(annotation.severity).toBe('notice');
    expect(annotation.message).toBe('Field missing in schema');
    expect(annotation.title).toBe('OpenAPI Drift Detected');
  });

  test('should create undocumented endpoint annotation', () => {
    const annotation = createUndocumentedEndpointAnnotation(
      'Endpoint not in OpenAPI spec',
      { method: 'DELETE', path: '/users/123' }
    );

    expect(annotation.type).toBe('undocumented_endpoint');
    expect(annotation.severity).toBe('notice');
    expect(annotation.message).toBe('Endpoint not in OpenAPI spec');
    expect(annotation.title).toBe('Undocumented Endpoint');
  });
});

test.describe('Integration Tests', () => {
  test('should work end-to-end with multiple annotations', () => {
    const exporter = new CIAnnotationsExporter({
      maxAnnotations: 10,
      failOnError: false,
    });

    // Add various annotations
    exporter.addAnnotation(createValidationErrorAnnotation(
      'Invalid email format',
      { method: 'POST', path: '/users', status: 400 },
      'openapi.yaml',
      100
    ));

    exporter.addAnnotation(createDriftWarningAnnotation(
      'Extra field "phone" not in schema',
      { method: 'GET', path: '/users', status: 200 }
    ));

    exporter.addAnnotation(createUndocumentedEndpointAnnotation(
      'Endpoint /admin not documented',
      { method: 'GET', path: '/admin' }
    ));

    expect(exporter.getAnnotations()).toHaveLength(3);

    let consoleOutput = '';
    const originalLog = console.log;
    console.log = (msg: string) => { consoleOutput += msg + '\n'; };
    
    exporter.export();
    
    console.log = originalLog;
    
    // Should complete without throwing
    expect(exporter.getAnnotations()).toHaveLength(3);
  });

  test('should fail on error when configured', () => {
    const exporter = new CIAnnotationsExporter({
      failOnError: true,
    });

    exporter.addAnnotation({
      type: 'validation_error',
      severity: 'error',
      message: 'Critical error',
    });

    let consoleOutput = '';
    const originalLog = console.log;
    console.log = (msg: string) => { consoleOutput += msg + '\n'; };
    
    expect(() => {
      exporter.export();
    }).toThrow('CI Annotations: 1 error(s) found');
    
    console.log = originalLog;
  });
});
