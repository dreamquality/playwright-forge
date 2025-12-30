# Publishing Guide

This guide explains how to publish playwright-forge to npm.

## Prerequisites

1. **npm account**: Create an account at [npmjs.com](https://www.npmjs.com)
2. **npm CLI**: Ensure npm is installed and logged in
   ```bash
   npm login
   ```

## Pre-publish Checklist

Before publishing, ensure:

- ✅ All tests pass: `npm test`
- ✅ Linting passes: `npm run lint`
- ✅ Build succeeds: `npm run build`
- ✅ Package builds correctly: `npm pack` (creates a tarball)
- ✅ Version number is correct in `package.json`
- ✅ README and documentation are up to date

## Dry Run

Test the publish process without actually publishing:

```bash
npm publish --dry-run
```

This will show you what files will be included in the package.

## Publishing Steps

### 1. Build the package

```bash
npm run build
```

### 2. Test the package locally

You can test the package by creating a tarball and installing it in another project:

```bash
# Create tarball
npm pack

# In another project
npm install /path/to/playwright-forge-1.0.0.tgz
```

### 3. Version bump (if needed)

For subsequent releases, bump the version:

```bash
# Patch release (1.0.0 -> 1.0.1)
npm version patch

# Minor release (1.0.0 -> 1.1.0)
npm version minor

# Major release (1.0.0 -> 2.0.0)
npm version major
```

### 4. Publish to npm

```bash
# Publish as public package
npm publish --access public
```

### 5. Verify publication

Check that the package is available:

```bash
npm view playwright-forge
```

Visit the package page: https://www.npmjs.com/package/playwright-forge

## Post-Publish

### Tag the release

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Create GitHub Release

1. Go to GitHub repository
2. Click "Releases"
3. Click "Create a new release"
4. Select the tag you just created
5. Add release notes
6. Publish release

## Installing the Published Package

After publishing, users can install with:

```bash
npm install playwright-forge
```

Or with specific version:

```bash
npm install playwright-forge@1.0.0
```

## Package Files

The following files are included in the published package (as defined in `package.json` `files` field):

- `dist/` - Compiled JavaScript and TypeScript declarations
- `README.md` - Package documentation
- `package.json` - Package metadata
- `LICENSE` (if present)

Files excluded (via `.gitignore` and npm's default excludes):

- `node_modules/`
- `src/` (source TypeScript, not needed by consumers)
- `tests/`
- `.git/`
- `test-results/`
- Development config files

## Updating the Package

For future updates:

1. Make changes to source code
2. Update tests
3. Update documentation
4. Bump version: `npm version patch|minor|major`
5. Build: `npm run build`
6. Test: `npm test`
7. Publish: `npm publish`
8. Tag and create GitHub release

## Troubleshooting

### Package name already taken

If `playwright-forge` is already taken, you can:

1. Choose a different name in `package.json`
2. Use a scoped package: `@your-username/playwright-forge`

### Permission denied

Ensure you're logged in:

```bash
npm whoami
npm login
```

### Build files not included

Ensure:

1. `npm run build` was run
2. `dist/` directory exists
3. `"files": ["dist"]` is in `package.json`

## Best Practices

1. **Semantic Versioning**: Follow [semver](https://semver.org/)
   - MAJOR: Breaking changes
   - MINOR: New features (backward compatible)
   - PATCH: Bug fixes (backward compatible)

2. **Changelog**: Maintain a CHANGELOG.md with release notes

3. **Testing**: Always test before publishing

4. **Documentation**: Keep README up to date

5. **Security**: Run `npm audit` before publishing

## Automation

Consider setting up automated publishing with GitHub Actions:

```yaml
name: Publish to npm

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Support

For issues with publishing:
- npm documentation: https://docs.npmjs.com/
- npm support: https://www.npmjs.com/support
