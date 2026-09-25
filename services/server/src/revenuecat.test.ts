/**
 * Webhook security and event-mapping tests.
 *
 * These are the parts that decide whether a paying customer keeps access, so
 * they are covered directly rather than only through the smoke test.
 */

import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  REVENUECAT_ENTITLEMENT,
  candidateUserKeys,
  concernsOurEntitlement,
  effectForEvent,
  parsePayload,
  signPayload,
  verifyBearer,
  verifySignature,
} from './revenuecat.js';

const SECRET = 'a-sufficiently-long-webhook-secret';
const NOW = 1_700_000_000;

function body(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    JSON.stringify({
      api_version: '1.0',
      event: {
        type: 'INITIAL_PURCHASE',
        id: 'evt-1',
        app_user_id: 'device-abc',
        product_id: 'deeper_plus_yearly',
        transaction_id: 'tx-1',
        entitlement_ids: [REVENUECAT_ENTITLEMENT],
        expiration_at_ms: NOW * 1000 + 31_536_000_000,
        environment: 'PRODUCTION',
        ...overrides,
      },
    }),
  );
}

describe('HMAC signature verification', () => {
  it('accepts a correctly signed body', () => {
    const raw = body();
    const header = signPayload(raw, SECRET, NOW);
    expect(verifySignature(raw, header, SECRET, NOW)).toEqual({ ok: true });
  });

  it('rejects a request with no signature header at all', () => {
    expect(verifySignature(body(), undefined, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'missing_signature',
    });
  });

  it('rejects a body signed with the wrong secret', () => {
    const raw = body();
    const header = signPayload(raw, 'some-other-secret', NOW);
    expect(verifySignature(raw, header, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a tampered body even when the header is otherwise valid', () => {
    const original = body();
    const header = signPayload(original, SECRET, NOW);
    // Flip a byte of the payload after signing — the classic body-substitution attack.
    const tampered = Buffer.from(original);
    const flipAt = tampered.length - 3;
    tampered[flipAt] = (tampered[flipAt] ?? 0) ^ 0x01;
    expect(verifySignature(tampered, header, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a replayed signature outside the tolerance window', () => {
    const raw = body();
    const header = signPayload(raw, SECRET, NOW - 3600);
    expect(verifySignature(raw, header, SECRET, NOW)).toEqual({ ok: false, reason: 'stale_timestamp' });
  });

  it('accepts a signature just inside the tolerance window', () => {
    const raw = body();
    const header = signPayload(raw, SECRET, NOW - 120);
    expect(verifySignature(raw, header, SECRET, NOW)).toEqual({ ok: true });
  });

  it('rejects a malformed header rather than throwing', () => {
    const raw = body();
    expect(verifySignature(raw, 'garbage', SECRET, NOW)).toEqual({ ok: false, reason: 'malformed_signature' });
    expect(verifySignature(raw, 't=abc,v1=zz', SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('survives a signature of the wrong length', () => {
    const raw = body();
    expect(verifySignature(raw, `t=${NOW},v1=deadbeef`, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('tolerates whitespace around the header parts', () => {
    const raw = body();
    const header = signPayload(raw, SECRET, NOW).replace('t=', 't= ').replace(',v1=', ' , v1= ');
    expect(verifySignature(raw, header, SECRET, NOW)).toEqual({ ok: true });
  });
});

describe('bearer authorization', () => {
  it('accepts a matching token with or without the Bearer prefix', () => {
    expect(verifyBearer(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(verifyBearer(SECRET, SECRET)).toBe(true);
  });

  it('rejects a wrong or missing token', () => {
    expect(verifyBearer('Bearer nope', SECRET)).toBe(false);
    expect(verifyBearer(undefined, SECRET)).toBe(false);
  });
});

describe('event effects', () => {
  it('grants access on purchase and renewal', () => {
    for (const type of ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED', 'UNCANCELLATION']) {
      expect(effectForEvent(type)).toBe('grant');
    }
  });

  it('revokes on expiration and refund', () => {
    expect(effectForEvent('EXPIRATION')).toBe('revoke');
    expect(effectForEvent('REFUND_REVOKE')).toBe('revoke');
  });

  it('does NOT revoke on cancellation, billing issue or pause', () => {
    // RevenueCat is explicit that access ends on EXPIRATION, and that
    // SUBSCRIPTION_PAUSED must not revoke. CANCELLATION also fires for refunds
    // and for a paid-but-not-auto-renewing subscriber, so it cannot be a revoke.
    for (const type of ['CANCELLATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED', 'INVOICE_ISSUANCE']) {
      expect(effectForEvent(type)).toBe('keep');
    }
  });

  it('keeps unknown future event types safe', () => {
    expect(effectForEvent('SOME_FUTURE_EVENT')).toBe('keep');
  });
});

describe('payload parsing', () => {
  it('extracts the event', () => {
    expect(parsePayload(body())?.app_user_id).toBe('device-abc');
  });

  it('returns null for malformed JSON or a wrong shape', () => {
    expect(parsePayload(Buffer.from('not json'))).toBeNull();
    expect(parsePayload(Buffer.from('{}'))).toBeNull();
    expect(parsePayload(Buffer.from(JSON.stringify({ event: { type: 'X' } })))).toBeNull();
  });

  it('collects every identity the event could refer to', () => {
    const event = parsePayload(
      body({ original_app_user_id: 'device-old', aliases: ['device-a', 'device-b', 'device-abc'] }),
    );
    expect(event && candidateUserKeys(event)).toEqual(['device-abc', 'device-old', 'device-a', 'device-b']);
  });

  it('ignores events that do not map to our entitlement', () => {
    const event = parsePayload(body({ entitlement_ids: ['some_other_entitlement'] }));
    expect(event && concernsOurEntitlement(event)).toBe(false);
  });

  it('accepts events mapped to our entitlement', () => {
    const event = parsePayload(body());
    expect(event && concernsOurEntitlement(event)).toBe(true);
  });
});
