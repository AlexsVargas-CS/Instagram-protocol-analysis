/**
 * Utility Functions
 * 
 * Helper functions for the Instagram protocol analysis project.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Config directory location
const CONFIG_DIR = path.join(os.homedir(), '.ig-research');

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Get path to session file
 */
export function getSessionPath(): string {
  return path.join(CONFIG_DIR, 'session.json');
}

/**
 * Get path to config file
 */
export function getConfigPath(): string {
  return path.join(CONFIG_DIR, 'config.json');
}

/**
 * Generate UUID v4
 * 
 * Used for device IDs, request contexts, etc.
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate Android-style device ID
 */
export function generateAndroidId(): string {
  const hex = Array.from({ length: 16 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return `android-${hex}`;
}

/**
 * Sleep for specified milliseconds
 * 
 * Useful for rate limiting and human-like behavior
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max milliseconds
 * 
 * Helps avoid detection by adding randomness to request timing
 */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(delay);
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9.-]/gi, '_');
}

/**
 * Check if session file exists and is valid
 */
export function hasValidSession(): boolean {
  const sessionPath = getSessionPath();
  
  if (!fs.existsSync(sessionPath)) {
    return false;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    return data && data.cookies && data.cookies.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get current timestamp in Instagram format (microseconds)
 */
export function getInstagramTimestamp(): string {
  return (Date.now() * 1000).toString();
}

/**
 * Parse Instagram timestamp to Date
 */
export function parseInstagramTimestamp(timestamp: string | number): Date {
  const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
  return new Date(ts / 1000); // Convert from microseconds
}

export default {
  ensureConfigDir,
  getSessionPath,
  getConfigPath,
  generateUUID,
  generateAndroidId,
  sleep,
  randomDelay,
  formatBytes,
  sanitizeFilename,
  hasValidSession,
  getInstagramTimestamp,
  parseInstagramTimestamp,
};
