/**
 * File-backed ZGStorageClient. Persists blobs + KV to a single JSON file
 * on disk so chat history (and any other ZGMemory log) survives refreshes
 * AND server restarts.
 *
 * Drop-in replacement for InMemoryZGStorage. The shape on disk is:
 *
 *   { "blobs": { "0x<hash>": "<base64>" },
 *     "kv":    { "<ns>:<key>": "<base64>" } }
 *
 * One-line upgrade path: when @0gfoundation/0g-ts-sdk is wired, replace
 * the constructor in `server.ts` with `RealZGStorageClient`. The Memory
 * layer above is unaffected.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Hex } from 'viem';
import type { ZGStorageClient } from './zg-storage';

interface OnDiskShape {
  blobs: Record<string, string>;
  kv: Record<string, string>;
}

export class FileBackedZGStorage implements ZGStorageClient {
  private blobs: Map<string, Uint8Array>;
  private kv: Map<string, Uint8Array>;
  private writeQueued = false;

  constructor(private filePath: string) {
    this.blobs = new Map();
    this.kv = new Map();
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      return;
    }
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as OnDiskShape;
      for (const [k, v] of Object.entries(parsed.blobs ?? {})) {
        this.blobs.set(k, b64decode(v));
      }
      for (const [k, v] of Object.entries(parsed.kv ?? {})) {
        this.kv.set(k, b64decode(v));
      }
    } catch (err) {
      console.warn(
        `[file-storage] failed to load ${this.filePath}: ${(err as Error).message} — starting empty`
      );
    }
  }

  /** Coalesce frequent writes — chat append fires this on every turn. */
  private scheduleFlush(): void {
    if (this.writeQueued) return;
    this.writeQueued = true;
    queueMicrotask(() => {
      this.writeQueued = false;
      this.flush();
    });
  }

  private flush(): void {
    const out: OnDiskShape = { blobs: {}, kv: {} };
    for (const [k, v] of this.blobs) out.blobs[k] = b64encode(v);
    for (const [k, v] of this.kv) out.kv[k] = b64encode(v);
    try {
      writeFileSync(this.filePath, JSON.stringify(out));
    } catch (err) {
      console.warn(
        `[file-storage] failed to write ${this.filePath}: ${(err as Error).message}`
      );
    }
  }

  async uploadBlob(data: Uint8Array): Promise<Hex> {
    const hash = await this.hash(data);
    this.blobs.set(hash, data);
    this.scheduleFlush();
    return hash;
  }

  async fetchBlob(hash: Hex): Promise<Uint8Array> {
    const blob = this.blobs.get(hash);
    if (!blob) throw new Error(`blob-not-found: ${hash}`);
    return blob;
  }

  async kvGet(namespace: string, key: string): Promise<Uint8Array | null> {
    return this.kv.get(`${namespace}:${key}`) ?? null;
  }

  async kvSet(namespace: string, key: string, value: Uint8Array): Promise<void> {
    this.kv.set(`${namespace}:${key}`, value);
    this.scheduleFlush();
  }

  async kvDelete(namespace: string, key: string): Promise<void> {
    this.kv.delete(`${namespace}:${key}`);
    this.scheduleFlush();
  }

  private async hash(data: Uint8Array): Promise<Hex> {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return ('0x' +
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')) as Hex;
  }
}

function b64encode(u8: Uint8Array): string {
  return Buffer.from(u8).toString('base64');
}
function b64decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}
