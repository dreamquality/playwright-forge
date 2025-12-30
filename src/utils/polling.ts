/**
 * Options for polling
 */
export type PollOptions = {
  interval?: number;
  timeout?: number;
  timeoutMessage?: string;
};

/**
 * Polls a condition until it returns true or times out
 * @param condition - Function that returns true when condition is met
 * @param options - Polling options
 * @returns Resolves when condition is met
 * @throws Error if timeout is reached
 */
export async function poll(
  condition: () => Promise<boolean> | boolean,
  options: PollOptions = {}
): Promise<void> {
  const interval = options.interval || 100;
  const timeout = options.timeout || 30000;
  const timeoutMessage = options.timeoutMessage || 'Polling timeout exceeded';
  
  const startTime = Date.now();
  
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await condition();
    
    if (result) {
      return;
    }
    
    if (Date.now() - startTime >= timeout) {
      throw new Error(timeoutMessage);
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Polls a function until it returns a non-null/non-undefined value
 * @param fn - Function that returns a value
 * @param options - Polling options
 * @returns The value returned by fn
 * @throws Error if timeout is reached
 */
export async function pollUntilValue<T>(
  fn: () => Promise<T | null | undefined> | T | null | undefined,
  options: PollOptions = {}
): Promise<T> {
  const interval = options.interval || 100;
  const timeout = options.timeout || 30000;
  const timeoutMessage = options.timeoutMessage || 'Polling timeout exceeded waiting for value';
  
  const startTime = Date.now();
  
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await fn();
    
    if (result !== null && result !== undefined) {
      return result;
    }
    
    if (Date.now() - startTime >= timeout) {
      throw new Error(timeoutMessage);
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
