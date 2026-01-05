# Soft Assertions Examples

This document provides comprehensive examples for using the soft assertions feature in playwright-forge.

## Table of Contents
- [Basic Usage](#basic-usage)
- [Fixture Usage with Auto-Verification](#fixture-usage-with-auto-verification)
- [Context Grouping](#context-grouping)
- [Manual Verification](#manual-verification)
- [CI Exports](#ci-exports)
- [Real-World Scenarios](#real-world-scenarios)

## Basic Usage

### Using the Utility Directly

```typescript
import { test, expect } from '@playwright/test';
import { softExpect } from 'playwright-forge';

test('basic soft assertions', async () => {
  const soft = softExpect();
  
  // Collect multiple assertions
  await soft.expect(1).toBe(1);
  await soft.expect(2).toBe(3); // Will fail
  await soft.expect('hello').toContain('world'); // Will fail
  
  // Manually verify - throws with all failures
  try {
    soft.assertAll();
  } catch (error) {
    console.log(error.message);
    // Output:
    // Soft assertions failed (2 errors):
    // 
    // [uncategorized] 2 errors:
    //   1. Expected: 3, Received: 2
    //   2. Expected substring: "world"
  }
});
```

## Fixture Usage with Auto-Verification

### Basic Fixture Usage

The recommended approach uses the `softExpectFixture` which automatically verifies assertions in the test teardown.

```typescript
import { softExpectFixture } from 'playwright-forge';

softExpectFixture('profile page validation', async ({ page, softExpect }) => {
  await page.goto('/profile');
  
  // All assertions are collected automatically
  await softExpect.expect(page.locator('#name')).toHaveText('John');
  await softExpect.expect(page.locator('#email')).toContainText('@');
  await softExpect.expect(page.locator('#age')).toBeVisible();
  
  // Test auto-fails in afterEach if any assertions failed
  // No need to call assertAll() manually
});
```

### Auto-Verification with afterEach

```typescript
import { softExpectFixture } from 'playwright-forge';

// Group tests that use soft assertions
softExpectFixture.describe('Dashboard Tests', () => {
  
  softExpectFixture('validates header elements', async ({ page, softExpect }) => {
    await page.goto('/dashboard');
    
    await softExpect.expect(page.locator('#logo')).toBeVisible();
    await softExpect.expect(page.locator('#user-menu')).toBeVisible();
    await softExpect.expect(page.locator('#notifications')).toBeVisible();
    
    // Automatically verified in afterEach
  });
  
  softExpectFixture('validates sidebar navigation', async ({ page, softExpect }) => {
    await page.goto('/dashboard');
    
    await softExpect.expect(page.locator('#nav-home')).toBeVisible();
    await softExpect.expect(page.locator('#nav-settings')).toBeVisible();
    await softExpect.expect(page.locator('#nav-logout')).toBeVisible();
  });
});
```

## Context Grouping

### UI Context

Group UI-related assertions together:

```typescript
softExpectFixture('UI validation', async ({ page, softExpect }) => {
  await page.goto('/dashboard');
  
  // All UI assertions grouped together
  await softExpect.ui(page.locator('#header')).toBeVisible();
  await softExpect.ui(page.locator('#title')).toHaveText('Dashboard');
  await softExpect.ui(page.locator('#footer')).toBeVisible();
  
  // If multiple fail, they're grouped in the report:
  // [UI] 2 errors:
  //   1. Locator not visible: #header
  //   2. Expected "Dashboard" but got "Home"
});
```

### API Context

Group API-related assertions:

```typescript
softExpectFixture('API validation', async ({ page, softExpect }) => {
  const response = await page.request.get('/api/users');
  const data = await response.json();
  
  // All API assertions grouped together
  await softExpect.api(response.status()).toBe(200);
  await softExpect.api(response.headers()['content-type']).toContain('json');
  await softExpect.api(data.users).toHaveLength(10);
  
  // Report groups API failures:
  // [API] 2 errors:
  //   1. Expected: 200, Received: 500
  //   2. Expected length: 10, Received: 5
});
```

### Validation Context

Group data validation assertions:

```typescript
softExpectFixture('form validation', async ({ page, softExpect }) => {
  await page.goto('/register');
  
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', 'securePass123');
  await page.fill('#age', '25');
  
  // Validate entered data
  await softExpect.validation(page.locator('#email')).toHaveValue('test@example.com');
  await softExpect.validation(page.locator('#password')).toHaveValue('securePass123');
  await softExpect.validation(page.locator('#age')).toHaveValue('25');
});
```

### Mixed Contexts

Combine multiple contexts in one test:

```typescript
softExpectFixture('checkout flow', async ({ page, softExpect }) => {
  // UI validation
  await softExpect.ui(page.locator('#checkout-form')).toBeVisible();
  await softExpect.ui(page.locator('#payment-section')).toBeVisible();
  
  // Fill form
  await page.fill('#card-number', '4242424242424242');
  
  // Data validation
  await softExpect.validation(page.locator('#card-number')).toHaveValue('4242424242424242');
  
  // Submit and check API
  const [response] = await Promise.all([
    page.waitForResponse('/api/checkout'),
    page.click('#submit-button')
  ]);
  
  await softExpect.api(response.status()).toBe(200);
  
  // UI confirmation
  await softExpect.ui(page.locator('#success-message')).toBeVisible();
  
  // Errors grouped by context:
  // [UI] 1 error: ...
  // [Validation] 1 error: ...
  // [API] 1 error: ...
});
```

### Custom Context

Create your own context labels:

```typescript
softExpectFixture('custom contexts', async ({ softExpect }) => {
  await softExpect.withContext('Database')('user-id-123').toBeDefined();
  await softExpect.withContext('Cache')('cached-value').not.toBeNull();
  await softExpect.withContext('Session')('session-token').toHaveLength(32);
  
  // Report shows custom contexts:
  // [Database] 1 error: ...
  // [Cache] 1 error: ...
});
```

## Manual Verification

Disable auto-verification for manual control:

```typescript
softExpectFixture.describe('Manual Verification Tests', () => {
  // Configure fixture to disable auto-verification
  softExpectFixture.use({
    softExpectOptions: { autoVerify: false }
  });
  
  softExpectFixture('manual verify at specific point', async ({ page, softExpect }) => {
    await page.goto('/form');
    
    // Collect assertions
    await softExpect.expect(page.locator('#field1')).toHaveValue('value1');
    await softExpect.expect(page.locator('#field2')).toHaveValue('value2');
    
    // Check for errors before proceeding
    if (softExpect.hasErrors()) {
      console.log(`Found ${softExpect.getErrors().length} errors`);
      softExpect.assertAll(); // Manually fail now
    }
    
    // Continue with test if no errors
    await page.click('#submit');
  });
  
  softExpectFixture('conditional verification', async ({ softExpect }) => {
    await softExpect.expect(1).toBe(2);
    await softExpect.expect(2).toBe(3);
    
    // Only verify if there are errors
    if (softExpect.hasErrors()) {
      const errors = softExpect.getErrors();
      console.log(`Collected ${errors.length} failures`);
      
      // Clear errors and continue
      softExpect.clear();
    }
    
    // Test continues without failing
  });
});
```

## CI Exports

### JSON Export

Export assertion failures as JSON for CI/CD pipelines:

```typescript
softExpectFixture.describe('CI Export Tests', () => {
  softExpectFixture.use({
    softExpectOptions: {
      autoVerify: true,
      exportJSON: true,
      exportPath: 'soft-assertions-report.json'
    }
  });
  
  softExpectFixture('with JSON export', async ({ page, softExpect }) => {
    await page.goto('/page');
    
    await softExpect.ui(page.locator('#element')).toBeVisible();
    await softExpect.api(200).toBe(500); // Fails
    
    // On test failure, JSON report is automatically created:
    // {
    //   "totalErrors": 1,
    //   "contexts": { "API": 1 },
    //   "errors": [
    //     {
    //       "message": "Expected: 500, Received: 200",
    //       "context": "API",
    //       "timestamp": 1234567890
    //     }
    //   ]
    // }
  });
});
```

### CI Annotations

Generate CI annotations programmatically:

```typescript
import { softExpect } from 'playwright-forge';

test('CI annotations', async ({ page }) => {
  const soft = softExpect();
  
  await soft.ui(page.locator('#header')).toBeVisible();
  await soft.api(200).toBe(404);
  await soft.validation('invalid@').toContain('.com');
  
  // Export for CI systems
  const report = soft.exportCIAnnotations();
  
  console.log('Total Errors:', report.totalErrors);
  console.log('By Context:', report.contexts);
  
  // Use in GitHub Actions, GitLab CI, etc.
  if (report.totalErrors > 0) {
    report.errors.forEach(err => {
      console.log(`::error::${err.context}: ${err.message}`);
    });
  }
});
```

## Real-World Scenarios

### E-Commerce Checkout Flow

```typescript
import { softExpectFixture } from 'playwright-forge';

softExpectFixture('complete checkout flow', async ({ page, softExpect }) => {
  // Navigate to product page
  await page.goto('/products/laptop');
  
  // Validate product page
  await softExpect.ui(page.locator('#product-name')).toHaveText('Gaming Laptop');
  await softExpect.ui(page.locator('#price')).toBeVisible();
  await softExpect.ui(page.locator('#add-to-cart')).toBeEnabled();
  
  // Add to cart
  await page.click('#add-to-cart');
  
  // Validate cart
  await page.goto('/cart');
  await softExpect.ui(page.locator('#cart-items')).toHaveCount(1);
  await softExpect.validation(page.locator('#item-name')).toHaveText('Gaming Laptop');
  await softExpect.validation(page.locator('#quantity')).toHaveValue('1');
  
  // Proceed to checkout
  await page.click('#checkout-button');
  
  // Fill checkout form
  await page.fill('#email', 'buyer@example.com');
  await page.fill('#card-number', '4242424242424242');
  await page.fill('#expiry', '12/25');
  await page.fill('#cvv', '123');
  
  // Validate form data
  await softExpect.validation(page.locator('#email')).toHaveValue('buyer@example.com');
  await softExpect.validation(page.locator('#card-number')).toHaveValue('4242424242424242');
  
  // Submit order
  const [response] = await Promise.all([
    page.waitForResponse('/api/orders'),
    page.click('#place-order')
  ]);
  
  // Validate API response
  await softExpect.api(response.status()).toBe(201);
  await softExpect.api(response.headers()['content-type']).toContain('json');
  
  const orderData = await response.json();
  await softExpect.validation(orderData.orderId).toMatch(/^ORD-\d{6}$/);
  await softExpect.validation(orderData.status).toBe('confirmed');
  
  // Validate success page
  await softExpect.ui(page.locator('#success-message')).toBeVisible();
  await softExpect.ui(page.locator('#order-number')).toContainText('ORD-');
  await softExpect.ui(page.locator('#confirmation-email')).toHaveText('buyer@example.com');
  
  // All assertions grouped by context in final report
});
```

### Multi-Step Form Validation

```typescript
softExpectFixture('multi-step registration', async ({ page, softExpect }) => {
  await page.goto('/register');
  
  // Step 1: Personal Info
  await softExpect.ui(page.locator('#step-indicator')).toHaveText('Step 1 of 3');
  
  await page.fill('#first-name', 'John');
  await page.fill('#last-name', 'Doe');
  await page.fill('#email', 'john.doe@example.com');
  
  await softExpect.validation(page.locator('#first-name')).toHaveValue('John');
  await softExpect.validation(page.locator('#last-name')).toHaveValue('Doe');
  await softExpect.validation(page.locator('#email')).toHaveValue('john.doe@example.com');
  
  await page.click('#next-step');
  
  // Step 2: Address
  await softExpect.ui(page.locator('#step-indicator')).toHaveText('Step 2 of 3');
  
  await page.fill('#address', '123 Main St');
  await page.fill('#city', 'New York');
  await page.fill('#zip', '10001');
  
  await softExpect.validation(page.locator('#address')).toHaveValue('123 Main St');
  await softExpect.validation(page.locator('#city')).toHaveValue('New York');
  
  await page.click('#next-step');
  
  // Step 3: Confirmation
  await softExpect.ui(page.locator('#step-indicator')).toHaveText('Step 3 of 3');
  await softExpect.ui(page.locator('#review-name')).toHaveText('John Doe');
  await softExpect.ui(page.locator('#review-email')).toHaveText('john.doe@example.com');
  await softExpect.ui(page.locator('#review-address')).toContainText('123 Main St');
  
  // Submit
  const [response] = await Promise.all([
    page.waitForResponse('/api/register'),
    page.click('#submit-registration')
  ]);
  
  await softExpect.api(response.status()).toBe(201);
  
  // Success
  await softExpect.ui(page.locator('#success-banner')).toBeVisible();
  await softExpect.ui(page.locator('#welcome-message')).toContainText('Welcome, John!');
});
```

### API Testing with Soft Assertions

```typescript
import { test } from '@playwright/test';
import { softExpect } from 'playwright-forge';

test('REST API comprehensive validation', async ({ request }) => {
  const soft = softExpect();
  
  // Test GET endpoint
  const getResponse = await request.get('/api/users/123');
  await soft.api(getResponse.status()).toBe(200);
  await soft.api(getResponse.headers()['content-type']).toContain('application/json');
  
  const userData = await getResponse.json();
  await soft.validation(userData.id).toBe('123');
  await soft.validation(userData.email).toContain('@');
  await soft.validation(userData.active).toBe(true);
  
  // Test POST endpoint
  const postResponse = await request.post('/api/users', {
    data: {
      name: 'New User',
      email: 'newuser@example.com'
    }
  });
  
  await soft.api(postResponse.status()).toBe(201);
  await soft.api(postResponse.headers()['location']).toContain('/api/users/');
  
  const newUser = await postResponse.json();
  await soft.validation(newUser.id).toBeDefined();
  await soft.validation(newUser.name).toBe('New User');
  
  // Test PUT endpoint
  const putResponse = await request.put('/api/users/123', {
    data: { name: 'Updated Name' }
  });
  
  await soft.api(putResponse.status()).toBe(200);
  
  // Test DELETE endpoint
  const deleteResponse = await request.delete('/api/users/999');
  await soft.api(deleteResponse.status()).toBe(204);
  
  // Verify all at once
  soft.assertAll();
});
```

## Best Practices

1. **Use Contexts Consistently**: Always group related assertions by context for better error reporting
2. **Auto-Verification**: Use the fixture with auto-verification for most cases
3. **Manual Verification**: Only disable auto-verification when you need conditional logic
4. **Clear Error Messages**: The grouped context reports make it easier to identify which part of your test failed
5. **CI Integration**: Use JSON export in CI/CD to track failure patterns over time
6. **Parallel Safety**: Each test gets its own `SoftExpect` instance, making it safe for parallel execution

## Migration from Standard Assertions

### Before (Standard Assertions)
```typescript
test('validation', async ({ page }) => {
  await expect(page.locator('#field1')).toHaveValue('value1');
  // Test stops here if this fails ❌
  await expect(page.locator('#field2')).toHaveValue('value2');
  await expect(page.locator('#field3')).toHaveValue('value3');
});
```

### After (Soft Assertions)
```typescript
softExpectFixture('validation', async ({ page, softExpect }) => {
  await softExpect.expect(page.locator('#field1')).toHaveValue('value1');
  await softExpect.expect(page.locator('#field2')).toHaveValue('value2');
  await softExpect.expect(page.locator('#field3')).toHaveValue('value3');
  // All three are checked, all failures reported ✅
});
```
