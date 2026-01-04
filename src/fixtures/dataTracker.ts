import { test as base, APIRequestContext } from '@playwright/test';

/**
 * Entity type identifier for tracked resources
 */
export type EntityType = string;

/**
 * Entity identifier (ID, key, or any unique identifier)
 */
export type EntityId = string | number;

/**
 * Tracked entity in the system
 */
export interface TrackedEntity {
  type: EntityType;
  id: EntityId;
  metadata?: Record<string, any>;
}

/**
 * Cleanup handler function for a specific entity type
 * @param api - Playwright API request context
 * @param id - Entity identifier to cleanup
 * @param metadata - Optional metadata about the entity
 */
export type CleanupHandler = (
  api: APIRequestContext,
  id: EntityId,
  metadata?: Record<string, any>
) => Promise<void> | void;

/**
 * Configuration options for data tracker
 */
export interface DataTrackerConfig {
  /**
   * Map of entity types to their cleanup handlers
   */
  cleanupHandlers?: Map<EntityType, CleanupHandler>;
  
  /**
   * Whether to enable debug logging
   */
  debug?: boolean;
  
  /**
   * Whether to continue cleanup even if one entity fails
   */
  continueOnError?: boolean;
}

/**
 * Data tracker for managing test-created resources
 * Tracks entities and automatically cleans them up after test execution
 */
export class DataTracker {
  private entities: TrackedEntity[] = [];
  private cleanupHandlers: Map<EntityType, CleanupHandler>;
  private debug: boolean;
  private continueOnError: boolean;

  constructor(
    private api: APIRequestContext,
    config?: DataTrackerConfig
  ) {
    this.cleanupHandlers = config?.cleanupHandlers || new Map();
    this.debug = config?.debug || false;
    this.continueOnError = config?.continueOnError !== false; // Default true
  }

  /**
   * Track a created entity for cleanup
   * @param type - Entity type (e.g., 'user', 'order', 'file')
   * @param id - Entity identifier
   * @param metadata - Optional metadata about the entity
   */
  track(type: EntityType, id: EntityId, metadata?: Record<string, any>): void {
    this.entities.push({ type, id, metadata });
    if (this.debug) {
      console.log(`[DataTracker] Tracked ${type}:${id}`, metadata || '');
    }
  }

  /**
   * Register a cleanup handler for a specific entity type
   * @param type - Entity type
   * @param handler - Cleanup handler function
   */
  registerHandler(type: EntityType, handler: CleanupHandler): void {
    this.cleanupHandlers.set(type, handler);
    if (this.debug) {
      console.log(`[DataTracker] Registered cleanup handler for type: ${type}`);
    }
  }

  /**
   * Manually cleanup a specific entity
   * @param type - Entity type
   * @param id - Entity identifier
   * @returns True if cleanup was successful, false otherwise
   */
  async cleanupEntity(type: EntityType, id: EntityId): Promise<boolean> {
    const handler = this.cleanupHandlers.get(type);
    if (!handler) {
      if (this.debug) {
        console.warn(`[DataTracker] No cleanup handler registered for type: ${type}`);
      }
      return false;
    }

    try {
      if (this.debug) {
        console.log(`[DataTracker] Cleaning up ${type}:${id}`);
      }
      
      const entity = this.entities.find(e => e.type === type && e.id === id);
      await handler(this.api, id, entity?.metadata);
      
      // Remove from tracked entities
      this.entities = this.entities.filter(e => !(e.type === type && e.id === id));
      
      if (this.debug) {
        console.log(`[DataTracker] Successfully cleaned up ${type}:${id}`);
      }
      return true;
    } catch (error) {
      console.error(`[DataTracker] Failed to cleanup ${type}:${id}:`, error);
      if (!this.continueOnError) {
        throw error;
      }
      return false;
    }
  }

  /**
   * Manually cleanup all entities of a specific type
   * @param type - Entity type to cleanup
   */
  async cleanupByType(type: EntityType): Promise<void> {
    const entitiesOfType = this.entities.filter(e => e.type === type);
    
    if (this.debug) {
      console.log(`[DataTracker] Cleaning up ${entitiesOfType.length} entities of type: ${type}`);
    }

    for (const entity of entitiesOfType) {
      await this.cleanupEntity(entity.type, entity.id);
    }
  }

  /**
   * Get all tracked entities
   */
  getTrackedEntities(): TrackedEntity[] {
    return [...this.entities];
  }

  /**
   * Get tracked entities by type
   */
  getTrackedEntitiesByType(type: EntityType): TrackedEntity[] {
    return this.entities.filter(e => e.type === type);
  }

  /**
   * Clear all tracked entities without cleanup
   * Useful for manual cleanup override
   */
  clear(): void {
    if (this.debug) {
      console.log(`[DataTracker] Clearing ${this.entities.length} tracked entities without cleanup`);
    }
    this.entities = [];
  }

  /**
   * Execute cleanup for all tracked entities in reverse order (LIFO)
   * Automatically called during test teardown
   */
  async cleanup(): Promise<void> {
    const entitiesToCleanup = [...this.entities].reverse();
    
    if (this.debug) {
      console.log(`[DataTracker] Starting cleanup of ${entitiesToCleanup.length} entities`);
    }

    for (const entity of entitiesToCleanup) {
      await this.cleanupEntity(entity.type, entity.id);
    }

    if (this.debug) {
      console.log(`[DataTracker] Cleanup completed. Remaining entities: ${this.entities.length}`);
    }
  }
}

/**
 * Data tracker options exposed to tests
 */
export interface DataTrackerOptions {
  /**
   * Track a created entity for cleanup
   */
  track: (type: EntityType, id: EntityId, metadata?: Record<string, any>) => void;
  
  /**
   * Register a cleanup handler for a specific entity type
   */
  registerHandler: (type: EntityType, handler: CleanupHandler) => void;
  
  /**
   * Manually cleanup a specific entity
   */
  cleanupEntity: (type: EntityType, id: EntityId) => Promise<boolean>;
  
  /**
   * Manually cleanup all entities of a specific type
   */
  cleanupByType: (type: EntityType) => Promise<void>;
  
  /**
   * Get all tracked entities
   */
  getTrackedEntities: () => TrackedEntity[];
  
  /**
   * Get tracked entities by type
   */
  getTrackedEntitiesByType: (type: EntityType) => TrackedEntity[];
  
  /**
   * Clear all tracked entities without cleanup (manual override)
   */
  clear: () => void;
}

/**
 * Configuration for the data tracker fixture
 */
export interface DataTrackerFixtureConfig {
  /**
   * Map of entity types to their cleanup handlers
   */
  cleanupHandlers?: Record<EntityType, CleanupHandler>;
  
  /**
   * Whether to enable debug logging
   */
  debug?: boolean;
  
  /**
   * Whether to continue cleanup even if one entity fails
   */
  continueOnError?: boolean;
}

/**
 * Data tracker fixture for managing test-created resources
 * Tracks entities and automatically cleans them up after test execution
 * 
 * Features:
 * - Track created entities with type and identifier
 * - Support API-based cleanup per entity type
 * - Auto-run cleanup in test teardown (even on failure)
 * - Allow manual cleanup override
 * - Parallel-safe and CI-friendly
 * - Integrates with existing API client
 * 
 * @example
 * ```typescript
 * import { dataTrackerFixture } from 'playwright-forge';
 * 
 * const test = dataTrackerFixture.use({
 *   dataTrackerConfig: {
 *     cleanupHandlers: {
 *       order: async (api, id) => {
 *         await api.delete(`/api/orders/${id}`);
 *       },
 *       user: async (api, id) => {
 *         await api.delete(`/api/users/${id}`);
 *       }
 *     }
 *   }
 * });
 * 
 * test('create order', async ({ playwright, dataTracker }) => {
 *   const api = await playwright.request.newContext({
 *     baseURL: 'https://api.example.com'
 *   });
 *   
 *   const response = await api.post('/api/orders', { data: { item: 'Book' } });
 *   const order = await response.json();
 *   
 *   dataTracker.track('order', order.id);
 *   
 *   expect(order.status).toBe('created');
 *   
 *   await api.dispose();
 *   // Order will be automatically cleaned up after test
 * });
 * ```
 */
export const dataTrackerFixture = base.extend<
  { 
    dataTracker: DataTrackerOptions;
    dataTrackerConfig?: DataTrackerFixtureConfig;
  }
>({
  dataTrackerConfig: [undefined, { option: true }],
  
  dataTracker: async ({ playwright, dataTrackerConfig }, use) => {
    // Create API context
    const apiContextOptions: Parameters<typeof playwright.request.newContext>[0] = {
      extraHTTPHeaders: {
        'Accept': 'application/json',
      },
    };

    // Optionally allow configuring baseURL (and other request options) via dataTrackerConfig
    const configBaseURL = (dataTrackerConfig as any)?.baseURL;
    if (configBaseURL) {
      (apiContextOptions as any).baseURL = configBaseURL;
    }

    const api = await playwright.request.newContext(apiContextOptions);
    // Convert config handlers from Record to Map
    const cleanupHandlers = new Map<EntityType, CleanupHandler>();
    if (dataTrackerConfig?.cleanupHandlers) {
      Object.entries(dataTrackerConfig.cleanupHandlers).forEach(([type, handler]) => {
        cleanupHandlers.set(type, handler);
      });
    }

    // Create data tracker instance
    const tracker = new DataTracker(api, {
      cleanupHandlers,
      debug: dataTrackerConfig?.debug,
      continueOnError: dataTrackerConfig?.continueOnError,
    });

    // Expose tracker methods to test
    const dataTrackerOptions: DataTrackerOptions = {
      track: tracker.track.bind(tracker),
      registerHandler: tracker.registerHandler.bind(tracker),
      cleanupEntity: tracker.cleanupEntity.bind(tracker),
      cleanupByType: tracker.cleanupByType.bind(tracker),
      getTrackedEntities: tracker.getTrackedEntities.bind(tracker),
      getTrackedEntitiesByType: tracker.getTrackedEntitiesByType.bind(tracker),
      clear: tracker.clear.bind(tracker),
    };

    await use(dataTrackerOptions);

    // Auto-cleanup all tracked entities (even on test failure)
    try {
      await tracker.cleanup();
    } finally {
      await api.dispose();
    }
  },
});
