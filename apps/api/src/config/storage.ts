import fs from 'fs';
import path from 'path';

const rawDir = process.env.STORAGE_LOCAL_DIR || './uploads';

/** Absolute path for all local file reads/writes (invoices, policies, etc.). */
export const localUploadDir = path.isAbsolute(rawDir)
  ? rawDir
  : path.resolve(process.cwd(), rawDir);

/** Join one or more path segments under the local upload root. */
export function storagePath(...segments: string[]): string {
  return path.join(localUploadDir, ...segments);
}

/** Create the upload root (and optional subfolders) on startup. */
export function initLocalStorage(): void {
  fs.mkdirSync(localUploadDir, { recursive: true });
}
