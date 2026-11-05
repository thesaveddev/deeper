/**
 * Entitlement writes.
 *
 * The bug these guard: `premium_entitlement` used to be recomputed as "does the
 * user hold the entitlement named by the event that just arrived". A DEEPER+
 * subscriber who then bought a second product had their premium flag recomputed
 * from that second product alone, which set the flag to false and silently
 * revoked the subscription they had already paid for. No error, no failed
 * webhook, just a customer who paid twice and lost access to the first thing.
 *
 * The fix is that the flag means "holds anything in PREMIUM_ENTITLEMENTS", and
 * the query is parameterised with that whole list rather than the incoming key.
 */

import { describe, expect, it } from 'vitest';
import { PREMIUM_ENTITLEMENTS, applyEntitlementWith, type EntitlementClient } from './persistence.js';

function recordingClient() {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const client: EntitlementClient = {
    query: async (text, values = []) => {
      calls.push({ text, values });
      return { rows: [] };
    },
  };
  return { client, calls };
}

const base = {
  userId: 'user-1',
  provider: 'revenuecat',
  active: true,
  expiresAt: null,
} as const;

describe('applyEntitlementWith', () => {
  it('recomputes premium across every known entitlement, not the incoming one', async () => {
    const { client, calls } = recordingClient();
    await applyEntitlementWith(client, { ...base, entitlementKey: 'adult_pack' });

    const update = calls.find((c) => c.text.includes('premium_entitlement'));
    expect(update).toBeDefined();

    // The critical assertion: the second parameter is the full entitlement
    // list. Before the fix it was `params.entitlementKey`.
    expect(update!.values[1]).toEqual([...PREMIUM_ENTITLEMENTS]);
    expect(update!.values[1]).not.toBe('adult_pack');
    expect(update!.values[1]).toContain('deeper_plus');
  });

  it('matches the entitlement key against a list rather than a single value', async () => {
    const { client, calls } = recordingClient();
    await applyEntitlementWith(client, { ...base, entitlementKey: 'deeper_plus' });
    const update = calls.find((c) => c.text.includes('premium_entitlement'))!;
    expect(update.text).toContain('= ANY($2::text[])');
    expect(update.text).not.toMatch(/entitlement_key\s*=\s*\$2\b/);
  });

  it('writes the entitlement row keyed by the product that was bought', async () => {
    const { client, calls } = recordingClient();
    await applyEntitlementWith(client, { ...base, entitlementKey: 'adult_pack', active: true });
    const insert = calls.find((c) => c.text.includes('INSERT INTO entitlements'))!;
    expect(insert.values).toContain('adult_pack');
  });

  it('records a purchase once, and only when there is a transaction', async () => {
    const { client, calls } = recordingClient();
    await applyEntitlementWith(client, {
      ...base,
      entitlementKey: 'deeper_plus',
      productId: 'com.deeper.plus.monthly',
      transactionId: 'tx-1',
    });
    const purchase = calls.find((c) => c.text.includes('INSERT INTO purchases'))!;
    expect(purchase).toBeDefined();
    expect(purchase.text).toContain('ON CONFLICT (transaction_id) DO NOTHING');
    expect(purchase.values).toContain('tx-1');

    const { client: client2, calls: calls2 } = recordingClient();
    await applyEntitlementWith(client2, { ...base, entitlementKey: 'deeper_plus' });
    expect(calls2.find((c) => c.text.includes('INSERT INTO purchases'))).toBeUndefined();
  });

  it('is one transaction: begin, then commit', async () => {
    const { client, calls } = recordingClient();
    await applyEntitlementWith(client, { ...base, entitlementKey: 'deeper_plus' });
    expect(calls[0]!.text).toBe('BEGIN');
    expect(calls[calls.length - 1]!.text).toBe('COMMIT');
  });

  it('commits even on a revoke, so the flag is re-derived rather than skipped', async () => {
    const { client, calls } = recordingClient();
    await applyEntitlementWith(client, { ...base, entitlementKey: 'deeper_plus', active: false });
    const update = calls.find((c) => c.text.includes('premium_entitlement'))!;
    expect(update).toBeDefined();
    expect(calls[calls.length - 1]!.text).toBe('COMMIT');
  });
});

describe('PREMIUM_ENTITLEMENTS', () => {
  it('includes the live product', () => {
    expect(PREMIUM_ENTITLEMENTS).toContain('deeper_plus');
  });

  it('has no duplicates', () => {
    expect(new Set(PREMIUM_ENTITLEMENTS).size).toBe(PREMIUM_ENTITLEMENTS.length);
  });
});
