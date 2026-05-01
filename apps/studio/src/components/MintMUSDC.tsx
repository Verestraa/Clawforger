import { useEffect } from 'react';
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { parseAbi } from 'viem';
import { Coins, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const MUSDC_ADDRESS = '0x9Fcc04937f05fab7EAd66c79AE1404ce2477A9A3' as const;
const MINT_AMOUNT = 10_000n * 10n ** 6n; // 10,000 mUSDC (6 decimals)

const MUSDC_ABI = parseAbi([
  'function mint(address to, uint256 amount)',
  'function balanceOf(address) view returns (uint256)',
]);

export function MintMUSDC() {
  const { address, isConnected } = useAccount();

  const {
    data: balance,
    refetch: refetchBalance,
    isLoading: balanceLoading,
  } = useReadContract({
    address: MUSDC_ADDRESS,
    abi: MUSDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const { writeContractAsync, isPending: isSending, data: txHash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Refetch balance when the mint tx confirms
  useEffect(() => {
    if (isSuccess) {
      toast.success('+10,000 mUSDC arrived');
      refetchBalance();
    }
  }, [isSuccess, refetchBalance]);

  async function handleMint() {
    if (!address) return;
    try {
      const hash = await writeContractAsync({
        address: MUSDC_ADDRESS,
        abi: MUSDC_ABI,
        functionName: 'mint',
        args: [address, MINT_AMOUNT],
      });
      toast.message('minting 10,000 mUSDC…', {
        description: `tx ${hash.slice(0, 10)}…${hash.slice(-6)}`,
      });
    } catch (err) {
      toast.error('mint failed', {
        description: (err as Error).message.slice(0, 100),
      });
    }
  }

  if (!isConnected) return null;

  const balanceDisplay = balanceLoading
    ? '…'
    : balance !== undefined
      ? formatUSDC(balance as bigint)
      : '0';

  const minting = isSending || isConfirming;

  return (
    <div className="flex items-center gap-2">
      <div className="pill" title="your mUSDC balance">
        <Coins size={12} className="text-accent" />
        <span className="font-mono">{balanceDisplay}</span>
        <span className="text-zinc-500">mUSDC</span>
      </div>
      <button
        onClick={handleMint}
        disabled={minting}
        className="btn disabled:opacity-50"
        title="mint 10,000 mUSDC for testing"
      >
        {minting ? (
          <>
            <Loader2 size={14} className="animate-spin" /> minting…
          </>
        ) : (
          <>
            <Plus size={14} /> 10k
          </>
        )}
      </button>
    </div>
  );
}

function formatUSDC(units: bigint): string {
  // 6 decimals — show whole numbers if clean, otherwise 2dp
  const whole = units / 1_000_000n;
  const fraction = units % 1_000_000n;
  if (fraction === 0n) return whole.toLocaleString();
  // For non-zero fractions show 2 decimals
  const dp = Number(fraction) / 1_000_000;
  return (Number(whole) + dp).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
