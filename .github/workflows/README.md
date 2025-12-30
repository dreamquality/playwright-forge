# GitHub Actions Workflows

This directory contains the CI/CD workflows for the playwright-forge package.

## Workflows

### CI Workflow (`ci.yml`)

**Triggers:**
- Push to `main`, `develop`, or `copilot/**` branches
- Pull requests to `main` or `develop` branches

**Jobs:**

1. **Test** - Runs on Node.js 18.x and 20.x
   - Installs dependencies
   - Runs linter (ESLint)
   - Builds the package
   - Installs Playwright browsers
   - Runs all tests
   - Uploads test results and coverage as artifacts

2. **Build** - Verifies the package can be built and packed
   - Builds the package
   - Runs `npm pack --dry-run` to verify
   - Checks package size
   - Uploads build artifacts

3. **Security** - Runs security audit
   - Runs `npm audit` on production dependencies
   - Reports any vulnerabilities found

### Publish Workflow (`publish.yml`)

**Triggers:**
- Automatically on GitHub releases (when a release is published)
- Manually via workflow dispatch with a tag input

**Jobs:**

1. **Publish** - Publishes the package to npm
   - Checks out the code at the release tag
   - Installs dependencies
   - Runs linter and tests
   - Verifies package version matches the release tag
   - Publishes to npm registry
   - Creates a GitHub deployment
   - Posts a summary of the published package

## Setup Requirements

### For CI Workflow

No additional setup required. The workflow runs automatically on pushes and PRs.

### For Publish Workflow

**Required Secret:**
- `NPM_TOKEN` - npm authentication token

**Setup Steps:**

1. Generate an npm token:
   ```bash
   npm login
   npm token create
   ```

2. Add the token to GitHub repository secrets:
   - Go to repository Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Your npm token
   - Click "Add secret"

## Publishing a Release

### Automatic Publishing (Recommended)

1. Update version in `package.json`:
   ```bash
   npm version patch  # or minor/major
   ```

2. Push the version commit and tag:
   ```bash
   git push
   git push --tags
   ```

3. Create a GitHub release:
   - Go to repository → Releases → "Create a new release"
   - Choose the tag you just created
   - Add release notes
   - Click "Publish release"

The publish workflow will automatically run and publish to npm.

### Manual Publishing

If you need to publish manually:

1. Go to Actions → "Publish to npm"
2. Click "Run workflow"
3. Enter the tag (e.g., `v1.0.0`)
4. Click "Run workflow"

## Monitoring

- **CI Status**: Check the status badge in the main README
- **Test Results**: Download from workflow run artifacts
- **Coverage Reports**: Download from workflow run artifacts
- **npm Package**: Visit https://www.npmjs.com/package/playwright-forge

## Troubleshooting

### CI Failures

**Lint failures:**
```bash
npm run lint
```

**Build failures:**
```bash
npm run build
```

**Test failures:**
```bash
npm test
```

### Publish Failures

**Version mismatch:**
- Ensure `package.json` version matches the release tag (without 'v' prefix)
- Example: tag `v1.0.0` should have version `1.0.0` in package.json

**Authentication error:**
- Verify `NPM_TOKEN` secret is set correctly
- Ensure token has publish permissions
- Generate a new token if needed

**Package already exists:**
- Cannot republish the same version
- Bump version and create a new release
