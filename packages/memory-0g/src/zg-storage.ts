/**
 * Thin client over 0G Storage Indexer + Node.
 *
 * The official @0gfoundation/0g-ts-sdk wraps these endpoints. We keep an
 * abstract interface here so:
 *   1. We can mock 0G Storage in tests without monkey-patching the SDK
 *   2. We can swap to the real SDK by changing one constructor
 *   3. CI can run without network access
 *
 * Wire the real SDK via `RealZGStorageClient` (TODO at the bottom).
 */

import type { Hex } from 'viem';

export interface ZGStorageClient {
  /** Upload a blob, return its content hash (0G Storage root) */
  uploadBlob(data: Uint8Array): Promise<Hex>;
  /** Fetch a blob by content hash */
  fetchBlob(hash: Hex): Promise<Uint8Array>;

  /** KV operations */
  kvGet(namespace: string, key: string): Promise<Uint8Array | null>;
  kvSet(namespace: string, key: string, value: Uint8Array): Promise<void>;
  kvDelete(namespace: string, key: string): Promise<void>;
}

/**
 * In-memory mock for tests + offline dev. Swap with RealZGStorageClient
 * for production.
 */
export class InMemoryZGStorage implements ZGStorageClient {
  private blobs = new Map<string, Uint8Array>();
  private kv = new Map<string, Uint8Array>();

  async uploadBlob(data: Uint8Array): Promise<Hex> {
    const hash = await this.hash(data);
    this.blobs.set(hash, data);
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
  }

  async kvDelete(namespace: string, key: string): Promise<void> {
    this.kv.delete(`${namespace}:${key}`);
  }

  private async hash(data: Uint8Array): Promise<Hex> {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return ('0x' +
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')) as Hex;
  }
}

/**
 * TODO: real 0G Storage client.
 *
 * Implementation outline (needs `@0gfoundation/0g-ts-sdk`):
 *
 * ```ts
 * import { Indexer, KvClient } from '@0gfoundation/0g-ts-sdk';
 *
 * export class RealZGStorageClient implements ZGStorageClient {
 *   constructor(private indexer: Indexer, private kv: KvClient, private signer: Wallet) {}
 *
 *   async uploadBlob(data: Uint8Array) {
 *     const [tx, err] = await this.indexer.upload(data, this.signer);
 *     if (err) throw err;
 *     return tx.rootHash as Hex;
 *   }
 *
 *   async fetchBlob(hash: Hex) {
 *     return this.indexer.download(hash);
 *   }
 *
 *   async kvGet(ns, k) {
 *     return this.kv.get(ns, new TextEncoder().encode(k));
 *   }
 *   // ... etc
 * }
 * ```
 *
 * Bun `bun add @0gfoundation/0g-ts-sdk` and replace InMemoryZGStorage in
 * the agent constructor with RealZGStorageClient. See WAKEUP.md.
 */
