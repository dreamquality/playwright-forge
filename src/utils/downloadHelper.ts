import { Page, Download } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Options for download helper
 */
export type DownloadOptions = {
  targetPath?: string;
  timeout?: number;
};

/**
 * Waits for and saves a download
 * @param page - Playwright page
 * @param triggerFn - Function that triggers the download
 * @param options - Download options
 * @returns Path to the downloaded file
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
    // Use temp directory with unique filename
    const tempDir = path.join(process.cwd(), 'downloads', `${Date.now()}-${process.pid}`);
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
