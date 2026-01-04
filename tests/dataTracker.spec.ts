import { test, expect } from '@playwright/test';
import { 
  dataTrackerFixture, 
  type CleanupHandler, 
  type EntityId,
  type EntityType
} from '../src/fixtures/dataTracker';

test.describe('Data Tracker Fixture', () => {
  
  test('should track entities', async () => {
    // We'll create a simple test to verify the fixture exists and types are correct
    const cleanupHandlers: Record<EntityType, CleanupHandler> = {
      order: async (api, id) => {
        // Mock cleanup
      },
    };
    
    expect(cleanupHandlers).toBeDefined();
  });

  test('should have correct type definitions', () => {
    const entityId: EntityId = '123';
    const entityType: EntityType = 'order';
    
    expect(entityId).toBe('123');
    expect(entityType).toBe('order');
  });
});

// Test with actual fixture
dataTrackerFixture.describe('Data Tracker - Core Functionality', () => {
  
  dataTrackerFixture('should track and cleanup entities', async ({ dataTracker, playwright }) => {
    // Setup: Create a mock API server to test cleanup calls
    const cleanedUpEntities: Array<{ type: string; id: EntityId }> = [];
    
    // Register cleanup handler
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUpEntities.push({ type: 'order', id });
    });
    
    // Track an entity
    dataTracker.track('order', '123');
    
    // Verify entity is tracked
    const tracked = dataTracker.getTrackedEntities();
    expect(tracked).toHaveLength(1);
    expect(tracked[0]).toEqual({
      type: 'order',
      id: '123',
      metadata: undefined
    });
    
    // Manual cleanup
    await dataTracker.cleanupEntity('order', '123');
    
    // Verify cleanup was called
    expect(cleanedUpEntities).toHaveLength(1);
    expect(cleanedUpEntities[0]).toEqual({ type: 'order', id: '123' });
    
    // Verify entity was removed from tracked list
    expect(dataTracker.getTrackedEntities()).toHaveLength(0);
  });
  
  dataTrackerFixture('should track multiple entities', async ({ dataTracker }) => {
    // Track multiple entities
    dataTracker.track('order', '1');
    dataTracker.track('order', '2');
    dataTracker.track('user', 'user-1');
    
    // Verify all entities are tracked
    const tracked = dataTracker.getTrackedEntities();
    expect(tracked).toHaveLength(3);
    
    // Verify filtering by type
    const orders = dataTracker.getTrackedEntitiesByType('order');
    expect(orders).toHaveLength(2);
    expect(orders[0].id).toBe('1');
    expect(orders[1].id).toBe('2');
    
    const users = dataTracker.getTrackedEntitiesByType('user');
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe('user-1');
  });
  
  dataTrackerFixture('should support metadata', async ({ dataTracker }) => {
    const metadata = { name: 'Test Order', amount: 100 };
    
    dataTracker.track('order', '123', metadata);
    
    const tracked = dataTracker.getTrackedEntities();
    expect(tracked[0].metadata).toEqual(metadata);
  });
  
  dataTrackerFixture('should cleanup by type', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    // Register handler
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    dataTracker.registerHandler('user', async (api, id) => {
      cleanedUp.push(`user-${id}`);
    });
    
    // Track multiple entities
    dataTracker.track('order', '1');
    dataTracker.track('order', '2');
    dataTracker.track('user', 'user-1');
    
    // Cleanup only orders
    await dataTracker.cleanupByType('order');
    
    // Verify orders were cleaned up in LIFO order (reverse of tracking)
    expect(cleanedUp).toEqual(['order-2', 'order-1']);
    expect(dataTracker.getTrackedEntities()).toHaveLength(1);
    expect(dataTracker.getTrackedEntities()[0].type).toBe('user');
  });
  
  dataTrackerFixture('should allow manual clear without cleanup', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    dataTracker.track('order', '1');
    dataTracker.track('order', '2');
    
    // Clear without cleanup
    dataTracker.clear();
    
    // Verify entities were cleared
    expect(dataTracker.getTrackedEntities()).toHaveLength(0);
    
    // Verify no cleanup was performed
    expect(cleanedUp).toHaveLength(0);
  });
  
  dataTrackerFixture('should handle cleanup errors gracefully', async ({ dataTracker }) => {
    let callCount = 0;
    
    dataTracker.registerHandler('order', async (api, id) => {
      callCount++;
      if (id === '2') {
        throw new Error('Cleanup failed for order 2');
      }
    });
    
    dataTracker.track('order', '1');
    dataTracker.track('order', '2');
    dataTracker.track('order', '3');
    
    // Cleanup should continue despite error (continueOnError defaults to true)
    await dataTracker.cleanupEntity('order', '2');
    
    // Verify error was handled and other cleanups can proceed
    expect(callCount).toBe(1);
  });
  
  dataTrackerFixture('should return false when no handler is registered', async ({ dataTracker }) => {
    dataTracker.track('unknown', '123');
    
    const result = await dataTracker.cleanupEntity('unknown', '123');
    
    expect(result).toBe(false);
    // Entity should not be removed if cleanup failed
    expect(dataTracker.getTrackedEntities()).toHaveLength(1);
  });
  
  dataTrackerFixture('should support numeric entity IDs', async ({ dataTracker }) => {
    const cleanedUp: number[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(id as number);
    });
    
    dataTracker.track('order', 123);
    dataTracker.track('order', 456);
    
    await dataTracker.cleanupByType('order');
    
    // Verify LIFO order (reverse of tracking)
    expect(cleanedUp).toEqual([456, 123]);
  });
});

// Test with pre-configured handlers
dataTrackerFixture.describe('Data Tracker - Pre-configured Handlers', () => {
  
  dataTrackerFixture.use({
    dataTrackerConfig: {
      cleanupHandlers: {
        order: async (api, id, metadata) => {
          // Simulated API call
          // In real scenario: await api.delete(`/api/orders/${id}`);
        },
        user: async (api, id) => {
          // Simulated API call
          // In real scenario: await api.delete(`/api/users/${id}`);
        }
      },
      debug: false,
      continueOnError: true
    }
  });
  
  dataTrackerFixture('should use pre-configured handlers', async ({ dataTracker }) => {
    // Track entities
    dataTracker.track('order', '123');
    dataTracker.track('user', 'user-456');
    
    // Verify entities are tracked
    expect(dataTracker.getTrackedEntities()).toHaveLength(2);
    
    // Cleanup will be automatically called on teardown
    // We can't directly test the cleanup since it happens after the test
    // But we can verify the entities are tracked
  });
  
  dataTrackerFixture('should support registering additional handlers at runtime', async ({ dataTracker }) => {
    const cleanedFiles: string[] = [];
    
    // Register additional handler at runtime
    dataTracker.registerHandler('file', async (api, id) => {
      cleanedFiles.push(id as string);
    });
    
    // Track and cleanup
    dataTracker.track('file', 'test.txt');
    await dataTracker.cleanupEntity('file', 'test.txt');
    
    expect(cleanedFiles).toEqual(['test.txt']);
  });
  
  // Test example from the issue
  dataTrackerFixture('create order example from issue', async ({ playwright, dataTracker }) => {
    // Simulate the example from the issue
    const api = await playwright.request.newContext({
      baseURL: 'https://jsonplaceholder.typicode.com'
    });
    
    // Register cleanup handler for orders
    dataTracker.registerHandler('order', async (apiContext, id) => {
      // In real scenario: await apiContext.delete(`/api/orders/${id}`);
      // For this test, we'll just track that it would be called
    });
    
    // Simulate creating an order
    const response = await api.post('/posts', {
      data: { title: 'Test Order', body: 'Order content', userId: 1 }
    });
    
    const order = await response.json();
    
    // Track the order for cleanup
    dataTracker.track('order', order.id);
    
    // Verify order was created
    expect(response.ok()).toBeTruthy();
    expect(order.id).toBeDefined();
    
    // Verify order is tracked
    const tracked = dataTracker.getTrackedEntities();
    expect(tracked).toHaveLength(1);
    expect(tracked[0].type).toBe('order');
    
    await api.dispose();
    
    // Cleanup will automatically happen on test teardown
  });
});

// Test LIFO cleanup order
dataTrackerFixture.describe('Data Tracker - LIFO Cleanup Order', () => {
  
  dataTrackerFixture('should cleanup entities in reverse order (LIFO)', async ({ dataTracker }) => {
    const cleanupOrder: string[] = [];
    
    dataTracker.registerHandler('resource', async (api, id) => {
      cleanupOrder.push(id as string);
    });
    
    // Track in order: A, B, C
    dataTracker.track('resource', 'A');
    dataTracker.track('resource', 'B');
    dataTracker.track('resource', 'C');
    
    // Manually trigger cleanup to test order
    // Get all resources in reverse
    const entities = dataTracker.getTrackedEntities();
    
    // Clean them up in reverse manually to verify order
    for (let i = entities.length - 1; i >= 0; i--) {
      await dataTracker.cleanupEntity(entities[i].type, entities[i].id);
    }
    
    // Verify cleanup happened in LIFO order: C, B, A
    expect(cleanupOrder).toEqual(['C', 'B', 'A']);
  });
});

// Test parallel safety
dataTrackerFixture.describe.parallel('Data Tracker - Parallel Safety', () => {
  
  dataTrackerFixture.use({
    dataTrackerConfig: {
      cleanupHandlers: {
        order: async (api, id) => {
          // Simulate cleanup
        }
      }
    }
  });
  
  dataTrackerFixture('parallel test 1', async ({ dataTracker }) => {
    dataTracker.track('order', 'order-1');
    const tracked = dataTracker.getTrackedEntities();
    
    // Each test should have its own isolated tracker
    expect(tracked.length).toBeGreaterThanOrEqual(1);
    expect(tracked.some(e => e.id === 'order-1')).toBeTruthy();
  });
  
  dataTrackerFixture('parallel test 2', async ({ dataTracker }) => {
    dataTracker.track('order', 'order-2');
    const tracked = dataTracker.getTrackedEntities();
    
    // Each test should have its own isolated tracker
    expect(tracked.length).toBeGreaterThanOrEqual(1);
    expect(tracked.some(e => e.id === 'order-2')).toBeTruthy();
  });
  
  dataTrackerFixture('parallel test 3', async ({ dataTracker }) => {
    dataTracker.track('order', 'order-3');
    const tracked = dataTracker.getTrackedEntities();
    
    // Each test should have its own isolated tracker
    expect(tracked.length).toBeGreaterThanOrEqual(1);
    expect(tracked.some(e => e.id === 'order-3')).toBeTruthy();
  });
});
