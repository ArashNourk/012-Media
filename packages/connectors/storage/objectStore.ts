import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Object storage adapter (local filesystem; an R2/S3 adapter implements the same interface). */
export interface ObjectStore {
  put(key: string, data: string | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  getText(key: string): Promise<string | undefined>;
  exists(key: string): Promise<boolean>;
  /** Absolute local path, when the store is local (used by the preview tooling). */
  localPath?(key: string): string;
}

export class LocalObjectStore implements ObjectStore {
  constructor(private root: string) {
    this.root = resolve(root);
  }
  private path(key: string): string {
    if (key.includes('..')) throw new Error('invalid object key');
    return join(this.root, key);
  }
  async put(key: string, data: string | Uint8Array, _contentType?: string): Promise<void> {
    const p = this.path(key);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
  }
  async get(key: string) {
    const p = this.path(key);
    return existsSync(p) ? new Uint8Array(readFileSync(p)) : undefined;
  }
  async getText(key: string) {
    const p = this.path(key);
    return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
  }
  async exists(key: string) {
    return existsSync(this.path(key));
  }
  localPath(key: string) {
    return this.path(key);
  }
}

export class MemoryObjectStore implements ObjectStore {
  m = new Map<string, Uint8Array>();
  async put(key: string, data: string | Uint8Array, _contentType?: string) {
    this.m.set(key, typeof data === 'string' ? new TextEncoder().encode(data) : data);
  }
  async get(key: string) {
    return this.m.get(key);
  }
  async getText(key: string) {
    const v = this.m.get(key);
    return v ? new TextDecoder().decode(v) : undefined;
  }
  async exists(key: string) {
    return this.m.has(key);
  }
}

export const sourceTextKey = (sha: string) => `research/sources/${sha}.txt`;
