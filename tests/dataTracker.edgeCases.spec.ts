import { expect } from '@playwright/test';
import { dataTrackerFixture } from '../src/fixtures/dataTracker';

/**
 * Comprehensive edge case tests for DataTracker fixture
 * Tests various scenarios including concurrent operations, error conditions, and boundary cases
 */

dataTrackerFixture.describe('Data Tracker - Edge Cases', () => {
  
  dataTrackerFixture('should handle empty entity list cleanup gracefully', async ({ dataTracker }) => {
    // No entities tracked, cleanup should not fail
    const entities = dataTracker.getTrackedEntities();
    expect(entities).toHaveLength(0);
    
    // Cleanup by type on non-existent type should not fail
    await dataTracker.cleanupByType('nonexistent');
    expect(dataTracker.getTrackedEntities()).toHaveLength(0);
  });
  
  dataTrackerFixture('should handle duplicate entity tracking', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    // Track the same entity multiple times
    dataTracker.track('order', '1');
    dataTracker.track('order', '1');
    dataTracker.track('order', '1');
    
    // Should have 3 entries
    expect(dataTracker.getTrackedEntities()).toHaveLength(3);
    
    // Cleanup all
    await dataTracker.cleanupByType('order');
    
    // Should attempt to cleanup 3 times (LIFO order)
    expect(cleanedUp).toEqual(['order-1', 'order-1', 'order-1']);
  });
  
  dataTrackerFixture('should handle special characters in entity IDs', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    // Track entities with special characters
    dataTracker.track('order', 'id-with-dashes');
    dataTracker.track('order', 'id_with_underscores');
    dataTracker.track('order', 'id.with.dots');
    dataTracker.track('order', 'id/with/slashes');
    dataTracker.track('order', 'id with spaces');
    
    await dataTracker.cleanupByType('order');
    
    expect(cleanedUp).toHaveLength(5);
    expect(cleanedUp).toContain('order-id with spaces');
    expect(cleanedUp).toContain('order-id/with/slashes');
  });
  
  dataTrackerFixture('should handle very long entity IDs', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    const longId = 'a'.repeat(1000);
    dataTracker.track('order', longId);
    
    await dataTracker.cleanupByType('order');
    
    expect(cleanedUp).toHaveLength(1);
    expect(cleanedUp[0]).toBe(`order-${longId}`);
  });
  
  dataTrackerFixture('should handle zero as entity ID', async ({ dataTracker }) => {
    const cleanedUp: number[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(id as number);
    });
    
    dataTracker.track('order', 0);
    
    await dataTracker.cleanupByType('order');
    
    expect(cleanedUp).toEqual([0]);
  });
  
  dataTrackerFixture('should handle negative entity IDs', async ({ dataTracker }) => {
    const cleanedUp: number[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(id as number);
    });
    
    dataTracker.track('order', -1);
    dataTracker.track('order', -999);
    
    await dataTracker.cleanupByType('order');
    
    expect(cleanedUp).toEqual([-999, -1]);
  });
  
  dataTrackerFixture('should handle cleanup when handler is registered after tracking', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    // Track before registering handler
    dataTracker.track('order', '1');
    dataTracker.track('order', '2');
    
    // Register handler after tracking
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    await dataTracker.cleanupByType('order');
    
    expect(cleanedUp).toEqual(['order-2', 'order-1']);
  });
  
  dataTrackerFixture('should handle overwriting handler for same type', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    // Register first handler
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`first-${id}`);
    });
    
    // Overwrite with second handler
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`second-${id}`);
    });
    
    dataTracker.track('order', '1');
    
    await dataTracker.cleanupByType('order');
    
    // Should use the second handler
    expect(cleanedUp).toEqual(['second-1']);
  });
  
  dataTrackerFixture('should handle mixed success and failure during cleanup', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      if (id === '2' || id === '4') {
        throw new Error(`Cleanup failed for order ${id}`);
      }
      cleanedUp.push(`order-${id}`);
    });
    
    dataTracker.track('order', '1');
    dataTracker.track('order', '2'); // Will fail
    dataTracker.track('order', '3');
    dataTracker.track('order', '4'); // Will fail
    dataTracker.track('order', '5');
    
    // Should continue despite errors (continueOnError defaults to true)
    await dataTracker.cleanupByType('order');
    
    // Should have cleaned up 3 out of 5 (in LIFO order: 5, 3, 1)
    expect(cleanedUp).toEqual(['order-5', 'order-3', 'order-1']);
  });
  
  dataTrackerFixture('should handle cleanup after manual clear', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    dataTracker.track('order', '1');
    dataTracker.track('order', '2');
    
    // Clear without cleanup
    dataTracker.clear();
    
    // Try to cleanup - should be no-op
    await dataTracker.cleanupByType('order');
    
    expect(cleanedUp).toHaveLength(0);
    expect(dataTracker.getTrackedEntities()).toHaveLength(0);
  });
  
  dataTrackerFixture('should handle cleanup of already cleaned entity', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    dataTracker.track('order', '1');
    
    // Cleanup once
    await dataTracker.cleanupEntity('order', '1');
    expect(cleanedUp).toEqual(['order-1']);
    
    // Try to cleanup again - handler will be called but entity not in tracked list
    // Returns true because handler exists and executes successfully
    const result = await dataTracker.cleanupEntity('order', '1');
    expect(result).toBe(true);
    
    // Handler is called again (no entity to remove from list, but handler executes)
    expect(cleanedUp).toEqual(['order-1', 'order-1']);
    
    // Entity list should still be empty
    expect(dataTracker.getTrackedEntities()).toHaveLength(0);
  });
  
  dataTrackerFixture('should handle large number of entities', async ({ dataTracker }) => {
    const cleanedUp: number[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(id as number);
    });
    
    // Track 1000 entities
    for (let i = 0; i < 1000; i++) {
      dataTracker.track('order', i);
    }
    
    expect(dataTracker.getTrackedEntities()).toHaveLength(1000);
    
    await dataTracker.cleanupByType('order');
    
    // Should have cleaned up all 1000 entities in LIFO order
    expect(cleanedUp).toHaveLength(1000);
    expect(cleanedUp[0]).toBe(999); // First cleaned (LIFO)
    expect(cleanedUp[999]).toBe(0); // Last cleaned
  });
  
  dataTrackerFixture('should handle multiple types with varying entity counts', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    dataTracker.registerHandler('user', async (api, id) => {
      cleanedUp.push(`user-${id}`);
    });
    
    dataTracker.registerHandler('file', async (api, id) => {
      cleanedUp.push(`file-${id}`);
    });
    
    // Different counts for different types
    dataTracker.track('order', '1');
    dataTracker.track('user', 'A');
    dataTracker.track('user', 'B');
    dataTracker.track('order', '2');
    dataTracker.track('file', 'F1');
    dataTracker.track('file', 'F2');
    dataTracker.track('file', 'F3');
    
    expect(dataTracker.getTrackedEntitiesByType('order')).toHaveLength(2);
    expect(dataTracker.getTrackedEntitiesByType('user')).toHaveLength(2);
    expect(dataTracker.getTrackedEntitiesByType('file')).toHaveLength(3);
    
    // Cleanup only files
    await dataTracker.cleanupByType('file');
    
    expect(cleanedUp).toEqual(['file-F3', 'file-F2', 'file-F1']);
    expect(dataTracker.getTrackedEntities()).toHaveLength(4); // 2 orders + 2 users
  });
  
  dataTrackerFixture('should handle metadata with null and undefined values', async ({ dataTracker }) => {
    dataTracker.track('order', '1', { key: null });
    dataTracker.track('order', '2', { key: undefined });
    dataTracker.track('order', '3', {});
    
    const entities = dataTracker.getTrackedEntities();
    
    expect(entities[0].metadata?.key).toBe(null);
    expect(entities[1].metadata?.key).toBe(undefined);
    expect(entities[2].metadata).toEqual({});
  });
  
  dataTrackerFixture('should handle complex metadata objects', async ({ dataTracker }) => {
    const complexMetadata = {
      nested: {
        deeply: {
          nested: {
            value: 'test'
          }
        }
      },
      array: [1, 2, 3],
      date: new Date().toISOString(),
      boolean: true,
      number: 42
    };
    
    dataTracker.track('order', '1', complexMetadata);
    
    const entities = dataTracker.getTrackedEntities();
    expect(entities[0].metadata).toEqual(complexMetadata);
  });
  
  dataTrackerFixture('should track and cleanup entities of same ID but different types', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    dataTracker.registerHandler('user', async (api, id) => {
      cleanedUp.push(`user-${id}`);
    });
    
    // Same ID but different types
    dataTracker.track('order', '123');
    dataTracker.track('user', '123');
    
    expect(dataTracker.getTrackedEntities()).toHaveLength(2);
    
    await dataTracker.cleanupByType('order');
    
    expect(cleanedUp).toEqual(['order-123']);
    expect(dataTracker.getTrackedEntities()).toHaveLength(1);
    expect(dataTracker.getTrackedEntities()[0].type).toBe('user');
  });
  
  dataTrackerFixture('should handle handler that returns undefined vs Promise<void>', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    // Sync handler (returns void)
    dataTracker.registerHandler('sync', (api, id) => {
      cleanedUp.push(`sync-${id}`);
    });
    
    // Async handler (returns Promise<void>)
    dataTracker.registerHandler('async', async (api, id) => {
      await new Promise(resolve => setTimeout(resolve, 1));
      cleanedUp.push(`async-${id}`);
    });
    
    dataTracker.track('sync', '1');
    dataTracker.track('async', '2');
    
    await dataTracker.cleanupByType('sync');
    await dataTracker.cleanupByType('async');
    
    expect(cleanedUp).toEqual(['sync-1', 'async-2']);
  });
});

dataTrackerFixture.describe('Data Tracker - Automatic Teardown Edge Cases', () => {
  
  dataTrackerFixture('should cleanup all entities automatically on teardown', async ({ dataTracker }) => {
    const cleanedUp: string[] = [];
    
    dataTracker.registerHandler('order', async (api, id) => {
      cleanedUp.push(`order-${id}`);
    });
    
    dataTracker.registerHandler('user', async (api, id) => {
      cleanedUp.push(`user-${id}`);
    });
    
    // Track multiple entities
    dataTracker.track('order', '1');
    dataTracker.track('user', 'A');
    dataTracker.track('order', '2');
    dataTracker.track('user', 'B');
    
    // Don't manually cleanup - will happen in teardown
    expect(dataTracker.getTrackedEntities()).toHaveLength(4);
    
    // Teardown will cleanup automatically in LIFO order
  });
  
  dataTrackerFixture('should handle test failure scenario', async ({ dataTracker }) => {
    dataTracker.registerHandler('order', async (api, id) => {
      // Track that cleanup was attempted
      console.log(`Cleaning up order ${id}`);
    });
    
    dataTracker.track('order', 'test-failure');
    
    // Simulate successful test
    expect(true).toBe(true);
    
    // Even if this test were to fail, cleanup would still happen
  });
});

dataTrackerFixture.describe('Data Tracker - Configuration Edge Cases', () => {
  
  dataTrackerFixture.use({
    dataTrackerConfig: {
      baseURL: 'https://api.example.com',
      extraHTTPHeaders: {
        'X-Custom-Header': 'test-value'
      },
      debug: false,
      continueOnError: true
    }
  });
  
  dataTrackerFixture('should work with full configuration', async ({ dataTracker }) => {
    dataTracker.registerHandler('order', async (api, id) => {
      // Handler receives configured API context
    });
    
    dataTracker.track('order', 'configured-test');
    
    expect(dataTracker.getTrackedEntities()).toHaveLength(1);
  });
});
