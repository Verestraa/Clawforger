import { describe, expect, test } from 'bun:test';
import { ZGMemory, InMemoryZGStorage, encrypt, decrypt, contentHash } from '../src';

async function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

describe('crypto round-trip', () => {
  test('encrypt → decrypt recovers original', async () => {
    const key = await makeKey();
    const original = { a: 1, b: 'hello', c: [1, 2, 3] };
    const blob = await encrypt(key, original);
    const recovered = await decrypt(key, blob);
    expect(recovered).toEqual(original);
  });

  test('different IVs produce different ciphertexts', async () => {
    const key = await makeKey();
    const data = { hello: 'world' };
    const a = await encrypt(key, data);
    const b = await encrypt(key, data);
    // Same plaintext + different IV = different ciphertext
    expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'));
  });

  test('contentHash is stable for the same input', async () => {
    const data = new TextEncoder().encode('hello');
    const a = await contentHash(data);
    const b = await contentHash(data);
    expect(a).toBe(b);
    expect(a.length).toBe(66); // 0x + 64 hex chars
  });
});

describe('ZGMemory KV', () => {
  test('kvSet → kvGet round trip', async () => {
    const memory = new ZGMemory({
      storage: new InMemoryZGStorage(),
      encryptionKey: await makeKey(),
      namespace: 'agents/1',
    });
    await memory.kvSet('current-task', { id: 't-1', desc: 'test' });
    const got = await memory.kvGet('current-task');
    expect(got).toEqual({ id: 't-1', desc: 'test' });
  });

  test('kvGet returns null for missing key', async () => {
    const memory = new ZGMemory({
      storage: new InMemoryZGStorage(),
      encryptionKey: await makeKey(),
      namespace: 'agents/1',
    });
    expect(await memory.kvGet('nonexistent')).toBeNull();
  });

  test('kvDelete removes the key', async () => {
    const memory = new ZGMemory({
      storage: new InMemoryZGStorage(),
      encryptionKey: await makeKey(),
      namespace: 'agents/1',
    });
    await memory.kvSet('k', 'v');
    expect(await memory.kvGet('k')).toBe('v');
    await memory.kvDelete('k');
    expect(await memory.kvGet('k')).toBeNull();
  });
});

describe('ZGMemory Log', () => {
  test('logAppend returns a content hash and logRead returns the entry', async () => {
    const memory = new ZGMemory({
      storage: new InMemoryZGStorage(),
      encryptionKey: await makeKey(),
      namespace: 'agents/1',
    });
    const ts = 1_700_000_000;
    const hash = await memory.logAppend({ kind: 'task-run', data: { ok: true }, ts });
    expect(hash.startsWith('0x')).toBe(true);

    const entries = await memory.logRead();
    expect(entries.length).toBe(1);
    expect(entries[0]).toEqual({ kind: 'task-run', data: { ok: true }, ts });
  });

  test('logRead respects time range filter', async () => {
    const memory = new ZGMemory({
      storage: new InMemoryZGStorage(),
      encryptionKey: await makeKey(),
      namespace: 'agents/1',
    });
    await memory.logAppend({ kind: 'a', data: 1, ts: 1000 });
    await memory.logAppend({ kind: 'b', data: 2, ts: 2000 });
    await memory.logAppend({ kind: 'c', data: 3, ts: 3000 });

    const middle = await memory.logRead({ from: 1500, to: 2500 });
    expect(middle.length).toBe(1);
    expect((middle[0] as any).kind).toBe('b');
  });
});
