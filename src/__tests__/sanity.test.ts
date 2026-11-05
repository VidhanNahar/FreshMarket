import { describe, it, expect } from 'vitest';
import { cn } from '../lib/utils';

describe('Sanity & Configuration Test', () => {
  it('merges tailwind class names properly', () => {
    const result = cn('px-2 py-1', 'bg-blue-500', { 'text-white': true, 'hidden': false });
    expect(result).toBe('px-2 py-1 bg-blue-500 text-white');
  });

  it('handles conflicting tailwind classes correctly', () => {
    const result = cn('p-4', 'p-2');
    expect(result).toBe('p-2');
  });

  it('can import web3 packages without syntax failure', async () => {
    const wagmi = await import('wagmi');
    const viem = await import('viem');
    const arkiv = await import('@arkiv-network/sdk');
    
    expect(wagmi).toBeDefined();
    expect(viem).toBeDefined();
    expect(arkiv).toBeDefined();
  });
});
