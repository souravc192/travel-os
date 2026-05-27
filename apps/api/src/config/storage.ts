import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { createReadStream } from 'fs';
import { logger } from './logger';

// ─── Driver contract ─────────────────────────────────────────
// Both drivers return a *storage key* (opaque path string we persist in DB)
// and accept the same key back for read/delete. To flip from local → S3
// later, only `createStorage()` needs to change.
export interface FileStorage {
  /**
   * Persist a buffer + return a storage key that read() can resolve.
   * `folder` lets us namespace files (e.g. 'invoices/2026/05').
   */
  put(folder: string, originalFilename: string, buf: Buffer): Promise<{
    key:      string;
    filename: string;
    bytes:    number;
  }>;
  /** Read back as a Node stream + size. Used by the file-serving endpoint. */
  read(key: string): Promise<{ stream: Readable; size: number }>;
  /** Delete (best-effort, swallows ENOENT). */
  remove(key: string): Promise<void>;
}

// ─── Local-disk driver ───────────────────────────────────────
class LocalStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    // Defence in depth: never let a key climb out of root
    const safe = path.normalize(key).replace(/^([./\\]+)/, '');
    return path.join(this.root, safe);
  }

  async put(folder: string, originalFilename: string, buf: Buffer) {
    const safeFolder = folder.replace(/[^a-zA-Z0-9_/-]/g, '');
    const ext = path.extname(originalFilename).toLowerCase().slice(0, 10);
    const filename = `${randomUUID()}${ext}`;
    const key = path.posix.join(safeFolder, filename);

    const full = this.resolve(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, buf);

    return { key, filename, bytes: buf.length };
  }

  async read(key: string) {
    const full = this.resolve(key);
    const stat = await fsp.stat(full);
    return { stream: createReadStream(full), size: stat.size };
  }

  async remove(key: string) {
    try {
      await fsp.unlink(this.resolve(key));
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code !== 'ENOENT') throw err;
    }
  }
}

// ─── S3 driver (stub — flip later) ───────────────────────────
// To enable: set STORAGE_DRIVER=s3 and STORAGE_S3_BUCKET / region / creds.
class S3Storage implements FileStorage {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async put(_folder: string, _originalFilename: string, _buf: Buffer) {
    throw new Error('S3 storage driver is not implemented yet. Use STORAGE_DRIVER=local.');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async read(_key: string) { throw new Error('S3 storage driver is not implemented yet.'); }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(_key: string) { throw new Error('S3 storage driver is not implemented yet.'); }
}

// ─── Factory ──────────────────────────────────────────────────
const rawDir = process.env.STORAGE_LOCAL_DIR || './uploads';
export const localUploadDir = path.isAbsolute(rawDir)
  ? rawDir
  : path.resolve(process.cwd(), rawDir);

/** Back-compat helper used elsewhere in the codebase. */
export function storagePath(...segments: string[]): string {
  return path.join(localUploadDir, ...segments);
}

/** Create the upload root on startup. */
export function initLocalStorage(): void {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

export function createStorage(): FileStorage {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver === 's3') {
    logger.info('Storage driver: S3 (stub)');
    return new S3Storage();
  }
  logger.info(`Storage driver: local @ ${localUploadDir}`);
  initLocalStorage();
  return new LocalStorage(localUploadDir);
}

export const storage: FileStorage = createStorage();
