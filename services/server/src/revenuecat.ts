/**
 * RevenueCat webhook handling.
 *
 * This is the server-side source of truth for DEEPER+. The client flag is only
 * a display concern; a deck stays locked until a webhook tells us otherwise.
 *
 * AUTHENTICATION
 * -------------
 * RevenueCat supports two independent mechanisms and we accept either:
 *
 *  1. HMAC signing (preferred). The dashboard signs every delivery and sends
 *     `X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hmac_sha256_hex>`, where the
 *     HMAC covers "<unix>.<raw body>". This is why the route mounts
 *     `express.raw()`: re-serialising a parsed body changes the bytes and
 *     breaks verification, so we must verify the exact bytes received.
 *  2. A static `Authorization: Bearer <secret>` header.
 *
 * Either way, an unsigned request is rejected with 401 and never applied.
 *
 * EVENT SEMANTICS
 * ---------------
 * Mapped from RevenueCat's documented behaviour rather than guessed:
 *
 *  - EXPIRATION is the event that means "remove access". Subscribing to
 *    CANCELLATION as a revoke would be wrong: CANCELLATION also fires for
 *    refunds, and for a plain auto-renew-off the subscriber has paid until the
 *    period ends. It is treated as a no-op here, and EXPIRATION follows when
 *    the period actually lapses.
 *  - SUBSCRIPTION_PAUSED must NOT revoke; access ends via EXPIRATION instead.
 *  - BILLING_ISSUE is a grace period, not an expiry, so access is kept.
 *
 * RevenueCat also recommends re-syncing via GET /subscribers for maximum
 * robustness. That is deliberately not done here: it would add a second
 * credential and a network round-trip to every delivery, and would break the
 * offline/no-RevenCat-CDN case. See README for when to add it.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Entitlement keys that grant premium access.
 *
 * A list, not a single constant, so a second paid product is an addition here
 * rather than a change to every comparison below. A grant for any of these
 * means the user holds premium; a revoke only clears the flag when the user
 * holds none of them, which is why `applyEntitlement` in persistence.ts
 * re-derives the flag across the whole list instead of trusting the key that
 * arrived with the event.
 */
export const REVENUECAT_ENTITLEMENTS: readonly string[] = ['deeper_plus'];

/** Kept for the callers that only ever deal with the one live product. */
export const REVENUECAT_ENTITLEMENT = REVENUECAT_ENTITLEMENTS[0]!;
const SIGNATURE_HEADER = 'x-revenuecat-webhook-signature';
/** Reject anything outside a few minutes of now to blunt replay attacks. */
const DEFAULT_TOLERANCE_SECONDS = 300;

export type EntitlementEffect = 'grant' | 'revoke' | 'keep';

/**
 * Event types that put (or keep) access in place.
 *
 * `CANCELLATION`, `BILLING_ISSUE`, `SUBSCRIPTION_PAUSED` and the invoice /
 * price-increase events intentionally map to 'keep' — see the module comment.
 */
const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'NON_RENEWING_PURCHASE',
  'UNCANCELLATION',
  'TRANSFER',
  'PURCHASE_REDEEMED',
  'REFUND_REVERSED',
  'TEST',
]);

const REVOKE_EVENTS = new Set(['EXPIRATION', 'REFUND_REVOKE']);

export function effectForEvent(type: string): EntitlementEffect {
  if (REVOKE_EVENTS.has(type)) return 'revoke';
  if (GRANT_EVENTS.has(type)) return 'grant';
  return 'keep';
}

/* ------------------------------------------------------------------ *
 * Payload
 * ------------------------------------------------------------------ */

const eventSchema = z.object({
  api_version: z.string().optional(),
  event: z
    .object({
      type: z.string(),
      id: z.string(),
      app_user_id: z.string().min(1),
      original_app_user_id: z.string().optional(),
      aliases: z.array(z.string()).optional(),
      product_id: z.string().optional(),
      transaction_id: z.string().optional(),
      entitlement_id: z.string().optional(),
      entitlement_ids: z.array(z.string()).nullish(),
      expiration_at_ms: z.number().nullish(),
      purchased_at_ms: z.number().nullish(),
      environment: z.string().optional(),
    })
    .passthrough(),
});

export type RevenueCatEvent = z.infer<typeof eventSchema>['event'];

export function parsePayload(raw: Buffer): RevenueCatEvent | null {
  try {
    const parsed = eventSchema.safeParse(JSON.parse(raw.toString('utf8')));
    return parsed.success ? parsed.data.event : null;
  } catch {
    return null;
  }
}

/** Every identity the event could refer to; the docs ask us to check them all. */
export function candidateUserKeys(event: RevenueCatEvent): string[] {
  const keys = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  return [...new Set(keys.filter((key): key is string => typeof key === 'string' && key.length > 0))];
}

/** Does this event concern one of our entitlements at all? */
export function concernsOurEntitlement(event: RevenueCatEvent): boolean {
  if (event.entitlement_ids?.length) {
    return event.entitlement_ids.some((id) => REVENUECAT_ENTITLEMENTS.includes(id));
  }
  // Fall back to the deprecated singular field, then to "assume yes" for a
  // grant: a product we have never mapped should not silently deny access.
  if (event.entitlement_id) return REVENUECAT_ENTITLEMENTS.includes(event.entitlement_id);
  return effectForEvent(event.type) !== 'keep';
}

/**
 * The entitlement this event is actually about.
 *
 * With more than one product, a revoke for `adult_pack` must not be recorded
 * against `deeper_plus`, or the two would overwrite each other in the
 * entitlements table's uniqueness key. Prefers the event's own list, falls back
 * to the singular field, and finally to the primary entitlement for a grant we
 * have never mapped.
 */
export function entitlementKeyFor(event: RevenueCatEvent): string {
  const known = event.entitlement_ids?.find((id) => REVENUECAT_ENTITLEMENTS.includes(id));
  if (known) return known;
  if (event.entitlement_id && REVENUECAT_ENTITLEMENTS.includes(event.entitlement_id)) {
    return event.entitlement_id;
  }
  return REVENUECAT_ENTITLEMENT;
}

/* ------------------------------------------------------------------ *
 * Authentication
 * ------------------------------------------------------------------ */

export type AuthFailure = 'missing_signature' | 'bad_signature' | 'stale_timestamp' | 'malformed_signature';

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure };

/**
 * Verify the `X-RevenueCat-Webhook-Signature` header against the raw body.
 *
 * `raw` MUST be the unparsed bytes: `JSON.parse` -> `JSON.stringify` changes
 * key order and spacing, which produces a different HMAC and rejects valid
 * deliveries.
 */
export function verifySignature(
  raw: Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): AuthResult {
  if (!header) return { ok: false, reason: 'missing_signature' };

  const parts: Record<string, string> = {};
  for (const piece of header.split(',')) {
    const index = piece.indexOf('=');
    if (index > 0) parts[piece.slice(0, index).trim()] = piece.slice(index + 1).trim();
  }
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return { ok: false, reason: 'malformed_signature' };

  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  const providedBytes = Buffer.from(provided, 'hex');
  // timingSafeEqual throws on length mismatch, so guard first.
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    return { ok: false, reason: 'bad_signature' };
  }

  const signedAt = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(signedAt) || Math.abs(nowSeconds - signedAt) > toleranceSeconds) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  return { ok: true };
}

/** Constant-time check of the optional static Authorization header. */
export function verifyBearer(header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const provided = header.startsWith('Bearer ') ? header.slice(7) : header;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sign a body the way RevenueCat does. Exported for tests and local tooling. */
export function signPayload(raw: Buffer, secret: string, timestampSeconds: number): string {
  const signature = createHmac('sha256', secret).update(`${timestampSeconds}.`).update(raw).digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}
