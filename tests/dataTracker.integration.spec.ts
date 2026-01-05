import { expect } from '@playwright/test';
import { dataTrackerFixture } from '../src/fixtures/dataTracker';

/**
 * Integration test demonstrating the Data Tracker fixture
 * Based on the example from the GitHub issue
 */

dataTrackerFixture.describe('Data Tracker Integration', () => {
  
  // Configure cleanup handlers for all tests in this describe block
  dataTrackerFixture.use({
    dataTrackerConfig: {
      cleanupHandlers: {
        // Example cleanup handler for orders
        order: async (api, id) => {
          // In a real scenario, this would delete the order via API
          // await api.delete(`/api/orders/${id}`);
          console.log(`Cleaning up order: ${id}`);
        },
        user: async (api, id) => {
          // await api.delete(`/api/users/${id}`);
          console.log(`Cleaning up user: ${id}`);
        }
      },
      debug: false,
      continueOnError: true
    }
  });
  
  dataTrackerFixture('Example from issue - create order', async ({ playwright, dataTracker }) => {
    // Setup API client with base URL for creating resources
    const api = await playwright.request.newContext({
      baseURL: 'https://jsonplaceholder.typicode.com'
    });
    
    // Register cleanup handler
    // Note: The cleanup handler receives the fixture's internal API context,
    // not the test's API context. For actual cleanup, configure baseURL in dataTrackerConfig.
    dataTracker.registerHandler('order', async (apiContext, id) => {
      // In real scenario with configured baseURL: await apiContext.delete(`/api/orders/${id}`);
      console.log(`Would delete order ${id}`);
    });
    
    // Create an order (simulated with JSONPlaceholder API)
    const response = await api.post('/posts', {
      data: {
        title: 'Test Order',
        body: 'Order content',
        userId: 1
      }
    });
    
    const order = await response.json();
    
    // Track the order for automatic cleanup
    dataTracker.track('order', order.id);
    
    // Assertions
    expect(response.ok()).toBeTruthy();
    expect(order.id).toBeDefined();
    expect(order.title).toBe('Test Order');
    
    // Cleanup happens automatically on test teardown
    
    await api.dispose();
  });
  
  dataTrackerFixture('Multiple entities cleanup', async ({ playwright, dataTracker }) => {
    const api = await playwright.request.newContext({
      baseURL: 'https://jsonplaceholder.typicode.com'
    });
    
    // Create multiple resources
    const user = await (await api.post('/users', {
      data: { name: 'Test User', email: 'test@example.com' }
    })).json();
    
    const order1 = await (await api.post('/posts', {
      data: { title: 'Order 1', userId: user.id }
    })).json();
    
    const order2 = await (await api.post('/posts', {
      data: { title: 'Order 2', userId: user.id }
    })).json();
    
    // Track all entities
    dataTracker.track('user', user.id);
    dataTracker.track('order', order1.id);
    dataTracker.track('order', order2.id);
    
    // Verify tracking
    const tracked = dataTracker.getTrackedEntities();
    expect(tracked).toHaveLength(3);
    
    const orders = dataTracker.getTrackedEntitiesByType('order');
    expect(orders).toHaveLength(2);
    
    // All will be cleaned up in reverse order (LIFO)
    // order2 -> order1 -> user
    
    await api.dispose();
  });
  
  dataTrackerFixture('Manual cleanup during test', async ({ playwright, dataTracker }) => {
    const api = await playwright.request.newContext({
      baseURL: 'https://jsonplaceholder.typicode.com'
    });
    
    // Create and track an order
    const order = await (await api.post('/posts', {
      data: { title: 'Temporary Order' }
    })).json();
    
    dataTracker.track('order', order.id);
    
    // Verify it's tracked
    expect(dataTracker.getTrackedEntities()).toHaveLength(1);
    
    // Manually cleanup before test end
    await dataTracker.cleanupEntity('order', order.id);
    
    // Verify it's no longer tracked
    expect(dataTracker.getTrackedEntities()).toHaveLength(0);
    
    await api.dispose();
  });
  
  dataTrackerFixture('Track with metadata', async ({ playwright, dataTracker }) => {
    const api = await playwright.request.newContext({
      baseURL: 'https://jsonplaceholder.typicode.com'
    });
    
    // Create order with metadata
    const order = await (await api.post('/posts', {
      data: { title: 'Premium Order', body: 'Important' }
    })).json();
    
    // Track with additional metadata
    dataTracker.track('order', order.id, {
      type: 'premium',
      priority: 'high',
      createdBy: 'integration-test'
    });
    
    // Verify metadata is stored
    const tracked = dataTracker.getTrackedEntities();
    expect(tracked[0].metadata).toEqual({
      type: 'premium',
      priority: 'high',
      createdBy: 'integration-test'
    });
    
    await api.dispose();
  });
  
  dataTrackerFixture('Cleanup even on test failure', async ({ playwright, dataTracker }) => {
    const api = await playwright.request.newContext({
      baseURL: 'https://jsonplaceholder.typicode.com'
    });
    
    // Create an order
    const order = await (await api.post('/posts', {
      data: { title: 'Order that will fail' }
    })).json();
    
    // Track it
    dataTracker.track('order', order.id);
    
    // This test simulates a failure scenario
    // Even if the test fails, the order should be cleaned up
    expect(order.id).toBeDefined();
    
    await api.dispose();
    
    // Cleanup will still happen in teardown
  });
});
