import type { Hex, PublicClient } from 'viem';

/**
 * 0G's public RPC intermittently lags receipt indexing. viem's default
 * waitForTransactionReceipt throws TransactionReceiptNotFoundError on those
 * blips. This wrapper does its own poll loop, swallows the not-found error,
 * and keeps trying until timeout.
 *
 * Mirrors waitForReceiptResilient in @clawforger/inft-identity.
 */
export async function waitForReceipt(
  client: PublicClient,
  hash: Hex,
  opts: { timeoutMs?: number; pollMs?: number; initialDelayMs?: number } = {}
): Promise<{ status: 'success' | 'reverted' }> {
  const { timeoutMs = 180_000, pollMs = 3_000, initialDelayMs = 2_000 } = opts;
  await new Promise((r) => setTimeout(r, initialDelayMs));

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await client.getTransactionReceipt({ hash });
      if (receipt) {
        return { status: receipt.status === 'success' ? 'success' : 'reverted' };
      }
    } catch {
      /* not yet — keep polling */
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`receipt-not-found-after-${timeoutMs}ms: ${hash}`);
}
