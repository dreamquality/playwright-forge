import { Page, Download } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * Options for download helper
 */
export type DownloadOptions = {
  targetPath?: string;
  timeout?: number;
};

// Counter for ensuring unique directory names within the same process
let downloadCounter = 0;

/**
 * Waits for and saves a download
 * @param page - Playwright page
 * @param triggerFn - Function that triggers the download
 * @param options - Download options
 * @returns Path to the downloaded file
 * @note When using default temp directories, they are not automatically cleaned up.
 *       Consider providing a targetPath or implementing cleanup in your test teardown.
 */
export async function waitForDownload(
  page: Page,
  triggerFn: () => Promise<void>,
  options: DownloadOptions = {}
): Promise<string> {
  const downloadPromise = page.waitForEvent('download', { timeout: options.timeout });
  
  await triggerFn();
  
  const download = await downloadPromise;
  const suggestedFilename = download.suggestedFilename();
  
  let targetPath: string;
  if (options.targetPath) {
    targetPath = options.targetPath;
  } else {
    // Use temp directory with robust unique identifier
    const uniqueId = `${Date.now()}-${process.pid}-${downloadCounter++}-${randomUUID().slice(0, 8)}`;
    const tempDir = path.join(process.cwd(), 'downloads', uniqueId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    targetPath = path.join(tempDir, suggestedFilename);
  }
  
  await download.saveAs(targetPath);
  return targetPath;
}

/**
 * Gets download information without saving
 * @param page - Playwright page
 * @param triggerFn - Function that triggers the download
 * @param timeout - Optional timeout
 * @returns Download object
 */
export async function getDownload(
  page: Page,
  triggerFn: () => Promise<void>,
  timeout?: number
): Promise<Download> {
  const downloadPromise = page.waitForEvent('download', { timeout });
  await triggerFn();
  return downloadPromise;
}
