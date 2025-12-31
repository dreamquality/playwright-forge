import { test, expect } from '@playwright/test';
import {
  stableClick,
  stableFill,
  stableSelect,
  type StableActionConfig
} from '../src';

test.describe('Stable Helpers Tests', () => {
  
  test.describe('stableClick', () => {
    
    test('should click visible and enabled button', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn">Click Me</button>
            <div id="result"></div>
            <script>
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn');
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });

    test('should wait for element to become visible', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn" style="display: none;">Click Me</button>
            <div id="result"></div>
            <script>
              setTimeout(() => {
                document.getElementById('btn').style.display = 'block';
              }, 500);
              
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn', { timeout: 2000 });
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });

    test('should wait for element to become enabled', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn" disabled>Click Me</button>
            <div id="result"></div>
            <script>
              setTimeout(() => {
                document.getElementById('btn').disabled = false;
              }, 500);
              
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn', { timeout: 2000 });
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });

    test('should retry on failure', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn">Click Me</button>
            <div id="result"></div>
            <script>
              let clickCount = 0;
              document.getElementById('btn').addEventListener('click', () => {
                clickCount++;
                document.getElementById('result').textContent = 'Clicked ' + clickCount + ' times!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn', { maxRetries: 3, retryInterval: 100 });
      
      const result = await page.locator('#result').textContent();
      expect(result).toContain('Clicked');
    });

    test('should fail after max retries in strict mode', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn" style="display: none;">Click Me</button>
          </body>
        </html>
      `);
      
      await expect(
        stableClick(page, '#btn', { 
          maxRetries: 2, 
          timeout: 500,
          retryInterval: 100,
          mode: 'strict'
        })
      ).rejects.toThrow();
    });

    test('should handle tolerant mode', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn" style="display: none;">Click Me</button>
          </body>
        </html>
      `);
      
      // In tolerant mode, it should log warnings but NOT throw
      await stableClick(page, '#btn', { 
        maxRetries: 1, 
        timeout: 500,
        mode: 'tolerant',
        debug: true
      });
      
      // If we reach here, tolerant mode worked correctly (didn't throw)
      expect(true).toBe(true);
    });

    test('should work with debug logging', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn">Click Me</button>
            <div id="result"></div>
            <script>
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn', { debug: true });
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });
  });

  test.describe('stableFill', () => {
    
    test('should fill input field', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <input id="input" type="text" />
          </body>
        </html>
      `);
      
      await stableFill(page, '#input', 'Hello World');
      
      const value = await page.locator('#input').inputValue();
      expect(value).toBe('Hello World');
    });

    test('should clear existing value before filling', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <input id="input" type="text" value="Old Value" />
          </body>
        </html>
      `);
      
      await stableFill(page, '#input', 'New Value');
      
      const value = await page.locator('#input').inputValue();
      expect(value).toBe('New Value');
    });

    test('should fill textarea', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <textarea id="textarea"></textarea>
          </body>
        </html>
      `);
      
      await stableFill(page, '#textarea', 'Multi\nLine\nText');
      
      const value = await page.locator('#textarea').inputValue();
      expect(value).toBe('Multi\nLine\nText');
    });

    test('should wait for input to become visible', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <input id="input" type="text" style="display: none;" />
            <script>
              setTimeout(() => {
                document.getElementById('input').style.display = 'block';
              }, 500);
            </script>
          </body>
        </html>
      `);
      
      await stableFill(page, '#input', 'Hello', { timeout: 2000 });
      
      const value = await page.locator('#input').inputValue();
      expect(value).toBe('Hello');
    });

    test('should wait for input to become enabled', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <input id="input" type="text" disabled />
            <script>
              setTimeout(() => {
                document.getElementById('input').disabled = false;
              }, 500);
            </script>
          </body>
        </html>
      `);
      
      await stableFill(page, '#input', 'Hello', { timeout: 2000 });
      
      const value = await page.locator('#input').inputValue();
      expect(value).toBe('Hello');
    });

    test('should verify value was set correctly', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <input id="input" type="text" />
          </body>
        </html>
      `);
      
      await stableFill(page, '#input', 'Verified Value');
      
      const value = await page.locator('#input').inputValue();
      expect(value).toBe('Verified Value');
    });

    test('should retry if value not set correctly', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <input id="input" type="text" />
            <script>
              let fillAttempts = 0;
              const input = document.getElementById('input');
              
              // Intercept first fill attempt to simulate failure
              input.addEventListener('input', (e) => {
                fillAttempts++;
                if (fillAttempts === 1) {
                  // Clear on first attempt to simulate failure
                  setTimeout(() => { input.value = ''; }, 10);
                }
              });
            </script>
          </body>
        </html>
      `);
      
      await stableFill(page, '#input', 'Test Value', { 
        maxRetries: 3, 
        retryInterval: 200 
      });
      
      const value = await page.locator('#input').inputValue();
      expect(value).toBe('Test Value');
    });

    test('should fail after max retries', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <input id="input" type="text" disabled />
          </body>
        </html>
      `);
      
      await expect(
        stableFill(page, '#input', 'Test', { 
          maxRetries: 2, 
          timeout: 500,
          retryInterval: 100
        })
      ).rejects.toThrow();
    });

    test('should work with debug logging', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <input id="input" type="text" />
          </body>
        </html>
      `);
      
      await stableFill(page, '#input', 'Debug Test', { debug: true });
      
      const value = await page.locator('#input').inputValue();
      expect(value).toBe('Debug Test');
    });
  });

  test.describe('stableSelect', () => {
    
    test('should select option by value', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <select id="select">
              <option value="1">Option 1</option>
              <option value="2">Option 2</option>
              <option value="3">Option 3</option>
            </select>
          </body>
        </html>
      `);
      
      await stableSelect(page, '#select', '2');
      
      const value = await page.locator('#select').inputValue();
      expect(value).toBe('2');
    });

    test('should wait for select to become visible', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <select id="select" style="display: none;">
              <option value="1">Option 1</option>
              <option value="2">Option 2</option>
            </select>
            <script>
              setTimeout(() => {
                document.getElementById('select').style.display = 'block';
              }, 500);
            </script>
          </body>
        </html>
      `);
      
      await stableSelect(page, '#select', '2', { timeout: 2000 });
      
      const value = await page.locator('#select').inputValue();
      expect(value).toBe('2');
    });

    test('should wait for select to become enabled', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <select id="select" disabled>
              <option value="1">Option 1</option>
              <option value="2">Option 2</option>
            </select>
            <script>
              setTimeout(() => {
                document.getElementById('select').disabled = false;
              }, 500);
            </script>
          </body>
        </html>
      `);
      
      await stableSelect(page, '#select', '2', { timeout: 2000 });
      
      const value = await page.locator('#select').inputValue();
      expect(value).toBe('2');
    });

    test('should wait for options to be loaded', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <select id="select">
            </select>
            <script>
              setTimeout(() => {
                const select = document.getElementById('select');
                select.innerHTML = '<option value="1">Option 1</option><option value="2">Option 2</option>';
              }, 300);
            </script>
          </body>
        </html>
      `);
      
      await stableSelect(page, '#select', '2', { timeout: 3000, retryInterval: 150, maxRetries: 5 });
      
      const value = await page.locator('#select').inputValue();
      expect(value).toBe('2');
    });

    test('should verify selection was successful', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <select id="select">
              <option value="a">Option A</option>
              <option value="b">Option B</option>
              <option value="c">Option C</option>
            </select>
          </body>
        </html>
      `);
      
      await stableSelect(page, '#select', 'b');
      
      const value = await page.locator('#select').inputValue();
      expect(value).toBe('b');
    });

    test('should handle array of values for multi-select', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <select id="select" multiple>
              <option value="1">Option 1</option>
              <option value="2">Option 2</option>
              <option value="3">Option 3</option>
            </select>
          </body>
        </html>
      `);
      
      await stableSelect(page, '#select', ['2', '3']);
      
      const selectedOptions = await page.locator('#select option:checked').count();
      expect(selectedOptions).toBe(2);
    });

    test('should fail when no options available', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <select id="select">
            </select>
          </body>
        </html>
      `);
      
      await expect(
        stableSelect(page, '#select', '1', { 
          maxRetries: 2, 
          timeout: 500,
          retryInterval: 100
        })
      ).rejects.toThrow(/No options available/);
    });

    test('should fail after max retries', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <select id="select" disabled>
              <option value="1">Option 1</option>
            </select>
          </body>
        </html>
      `);
      
      await expect(
        stableSelect(page, '#select', '1', { 
          maxRetries: 2, 
          timeout: 500,
          retryInterval: 100
        })
      ).rejects.toThrow();
    });

    test('should work with debug logging', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <select id="select">
              <option value="1">Option 1</option>
              <option value="2">Option 2</option>
            </select>
          </body>
        </html>
      `);
      
      await stableSelect(page, '#select', '2', { debug: true });
      
      const value = await page.locator('#select').inputValue();
      expect(value).toBe('2');
    });
  });

  test.describe('Configuration Options', () => {
    
    test('should respect custom timeout', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn" style="display: none;">Click Me</button>
          </body>
        </html>
      `);
      
      const config: StableActionConfig = {
        timeout: 1000,
        maxRetries: 1
      };
      
      await expect(stableClick(page, '#btn', config)).rejects.toThrow();
    });

    test('should respect custom retry interval', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn">Click Me</button>
            <div id="result"></div>
            <script>
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      const config: StableActionConfig = {
        retryInterval: 50,
        maxRetries: 3
      };
      
      await stableClick(page, '#btn', config);
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });

    test('should respect custom max retries', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn" style="display: none;">Click Me</button>
          </body>
        </html>
      `);
      
      const config: StableActionConfig = {
        maxRetries: 1,
        timeout: 500,
        retryInterval: 100
      };
      
      await expect(stableClick(page, '#btn', config)).rejects.toThrow();
    });

    test('should work with all configuration options', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <input id="input" type="text" />
          </body>
        </html>
      `);
      
      const config: StableActionConfig = {
        timeout: 5000,
        retryInterval: 100,
        maxRetries: 5,
        scrollBehavior: 'center',
        debug: true,
        mode: 'strict',
        stabilityThreshold: 2,
        stabilityCheckInterval: 50
      };
      
      await stableFill(page, '#input', 'Full Config Test', config);
      
      const value = await page.locator('#input').inputValue();
      expect(value).toBe('Full Config Test');
    });
  });

  test.describe('Stability Detection', () => {
    
    test('should wait for animated element to stabilize before clicking', async ({ page }) => {
      await page.setContent(`
        <html>
          <head>
            <style>
              @keyframes slideIn {
                from { transform: translateX(-100px); }
                to { transform: translateX(0); }
              }
              .animated {
                animation: slideIn 1s ease-out;
              }
            </style>
          </head>
          <body>
            <button id="btn" class="animated">Click Me</button>
            <div id="result"></div>
            <script>
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn', {
        stabilityThreshold: 3,
        stabilityCheckInterval: 100,
        timeout: 5000
      });
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });

    test('should detect element movement and wait for stability', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn" style="position: absolute; top: 0; left: 0;">Click Me</button>
            <div id="result"></div>
            <script>
              let position = 0;
              const interval = setInterval(() => {
                position += 10;
                const btn = document.getElementById('btn');
                btn.style.left = position + 'px';
                if (position >= 100) {
                  clearInterval(interval);
                }
              }, 50);
              
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn', {
        stabilityThreshold: 5,
        stabilityCheckInterval: 100,
        timeout: 5000
      });
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });

    test('should handle fading elements with transitions', async ({ page }) => {
      await page.setContent(`
        <html>
          <head>
            <style>
              .fade-in {
                opacity: 0;
                transition: opacity 0.5s ease-in;
              }
              .visible {
                opacity: 1;
              }
            </style>
          </head>
          <body>
            <button id="btn" class="fade-in">Click Me</button>
            <div id="result"></div>
            <script>
              setTimeout(() => {
                document.getElementById('btn').classList.add('visible');
              }, 100);
              
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn', {
        timeout: 3000,
        stabilityThreshold: 3
      });
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });

    test('should fail fast when element is never rendered', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <div id="container"></div>
          </body>
        </html>
      `);
      
      await expect(
        stableClick(page, '#nonexistent', {
          timeout: 2000,
          stabilityCheckInterval: 100
        })
      ).rejects.toThrow(/not found or not rendered/);
    });

    test('should handle elements that appear and disappear', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn" style="display: none;">Click Me</button>
            <div id="result"></div>
            <script>
              let visible = false;
              setInterval(() => {
                const btn = document.getElementById('btn');
                visible = !visible;
                btn.style.display = visible ? 'block' : 'none';
              }, 200);
              
              setTimeout(() => {
                clearInterval;
                document.getElementById('btn').style.display = 'block';
              }, 1000);
              
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn', {
        timeout: 3000,
        maxRetries: 5,
        retryInterval: 200
      });
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });
  });

  test.describe('Configuration Validation', () => {
    
    test('should reject negative timeout', async ({ page }) => {
      await page.setContent('<html><body><button id="btn">Click</button></body></html>');
      
      await expect(
        stableClick(page, '#btn', { timeout: -1 })
      ).rejects.toThrow('timeout must be greater than 0');
    });

    test('should reject zero timeout', async ({ page }) => {
      await page.setContent('<html><body><button id="btn">Click</button></body></html>');
      
      await expect(
        stableClick(page, '#btn', { timeout: 0 })
      ).rejects.toThrow('timeout must be greater than 0');
    });

    test('should reject negative retryInterval', async ({ page }) => {
      await page.setContent('<html><body><button id="btn">Click</button></body></html>');
      
      await expect(
        stableClick(page, '#btn', { retryInterval: -1 })
      ).rejects.toThrow('retryInterval must be non-negative');
    });

    test('should reject zero maxRetries', async ({ page }) => {
      await page.setContent('<html><body><button id="btn">Click</button></body></html>');
      
      await expect(
        stableClick(page, '#btn', { maxRetries: 0 })
      ).rejects.toThrow('maxRetries must be at least 1');
    });

    test('should reject negative maxRetries', async ({ page }) => {
      await page.setContent('<html><body><button id="btn">Click</button></body></html>');
      
      await expect(
        stableClick(page, '#btn', { maxRetries: -1 })
      ).rejects.toThrow('maxRetries must be at least 1');
    });

    test('should reject zero stabilityThreshold', async ({ page }) => {
      await page.setContent('<html><body><button id="btn">Click</button></body></html>');
      
      await expect(
        stableClick(page, '#btn', { stabilityThreshold: 0 })
      ).rejects.toThrow('stabilityThreshold must be at least 1');
    });

    test('should reject negative stabilityCheckInterval', async ({ page }) => {
      await page.setContent('<html><body><button id="btn">Click</button></body></html>');
      
      await expect(
        stableClick(page, '#btn', { stabilityCheckInterval: -1 })
      ).rejects.toThrow('stabilityCheckInterval must be non-negative');
    });

    test('should accept zero retryInterval', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn">Click Me</button>
            <div id="result"></div>
            <script>
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn', { retryInterval: 0 });
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });

    test('should accept zero stabilityCheckInterval', async ({ page }) => {
      await page.setContent(`
        <html>
          <body>
            <button id="btn">Click Me</button>
            <div id="result"></div>
            <script>
              document.getElementById('btn').addEventListener('click', () => {
                document.getElementById('result').textContent = 'Clicked!';
              });
            </script>
          </body>
        </html>
      `);
      
      await stableClick(page, '#btn', { stabilityCheckInterval: 0, stabilityThreshold: 1 });
      
      const result = await page.locator('#result').textContent();
      expect(result).toBe('Clicked!');
    });
  });
});
