import type { Memory } from '@clawforger/core';
import type { Hex } from 'viem';
import { decrypt, encrypt } from './crypto';
import type { ZGStorageClient } from './zg-storage';

/**
 * 0G-backed implementation of the Memory interface.
 *
 *  - kvGet/kvSet → 0G KV namespaced by `agents/<tokenId>/`, AES-256-GCM
 *    encrypted client-side.
 *  - logAppend → 0G Storage Log (append-only). Returns the content hash
 *    so callers can pin it on-chain (e.g. as memoryRootHash on the iNFT).
 *  - logRead → reads back recent entries (caps at 1000 by default).
 */
export interface ZGMemoryOpts {
  storage: ZGStorageClient;
  encryptionKey: CryptoKey;
  /** Used to namespace KV entries. Typically `agents/${tokenId}` */
  namespace: string;
}

interface LogIndexEntry {
  ts: number;
  kind: string;
  hash: Hex;
}

export class ZGMemory implements Memory {
  constructor(private opts: ZGMemoryOpts) {}

  async kvGet(key: string): Promise<unknown | null> {
    const blob = await this.opts.storage.kvGet(this.opts.namespace, key);
    if (!blob) return null;
    return decrypt(this.opts.encryptionKey, blob);
  }

  async kvSet(key: string, value: unknown): Promise<void> {
    const encrypted = await encrypt(this.opts.encryptionKey, value);
    await this.opts.storage.kvSet(this.opts.namespace, key, encrypted);
  }

  async kvDelete(key: string): Promise<void> {
    await this.opts.storage.kvDelete(this.opts.namespace, key);
  }

  async logAppend(entry: { kind: string; data: unknown; ts: number }): Promise<Hex> {
    // Encrypt the entry, upload as a blob, push pointer onto the log index
    const blob = await encrypt(this.opts.encryptionKey, entry);
    const hash = await this.opts.storage.uploadBlob(blob);

    const indexEntry: LogIndexEntry = { ts: entry.ts, kind: entry.kind, hash };
    const idx = await this.readLogIndex();
    idx.push(indexEntry);
    await this.writeLogIndex(idx);

    return hash;
  }

  async logRead(opts?: { from?: number; to?: number }): Promise<unknown[]> {
    const idx = await this.readLogIndex();
    const filtered = idx.filter((e) => {
      if (opts?.from !== undefined && e.ts < opts.from) return false;
      if (opts?.to !== undefined && e.ts > opts.to) return false;
      return true;
    });
    const out: unknown[] = [];
    for (const e of filtered) {
      const blob = await this.opts.storage.fetchBlob(e.hash);
      out.push(await decrypt(this.opts.encryptionKey, blob));
    }
    return out;
  }

  private async readLogIndex(): Promise<LogIndexEntry[]> {
    const blob = await this.opts.storage.kvGet(this.opts.namespace, '__log_index__');
    if (!blob) return [];
    const decrypted = (await decrypt(this.opts.encryptionKey, blob)) as LogIndexEntry[];
    return decrypted;
  }

  private async writeLogIndex(idx: LogIndexEntry[]): Promise<void> {
    const blob = await encrypt(this.opts.encryptionKey, idx);
    await this.opts.storage.kvSet(this.opts.namespace, '__log_index__', blob);
  }
}
