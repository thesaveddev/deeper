/**
 * DEEPER+ Premium Adapter (RevenueCat)
 *
 * Prices, product names and the "save X%" claim all come from the App Store /
 * Play Store via RevenueCat offerings, so nothing here is hardcoded and the
 * figures are correct in whatever currency and locale the user is in.
 *
 * IMPORTANT: `react-native-purchases` is a native module and is NOT present in
 * Expo Go. A static import at the top of this file would throw during module
 * evaluation and, because the game store imports this module, would take down
 * the entire route graph — the same failure mode as `expo-notifications`. It is
 * therefore required lazily behind try/catch, and every export degrades to a
 * safe no-op when the native module is unavailable. Type-only imports are fine
 * and are erased at compile time.
 *
 * RevenueCat is the source of truth for entitlement on the client. The server
 * independently decides what to unlock, via the webhook that writes
 * `users.premium_entitlement`.
 */

import { Platform } from 'react-native';
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';

/** The SDK's static API lives on the default export, not the namespace. */
type PurchasesApi = typeof import('react-native-purchases').default;
type PurchasesModule = { default?: PurchasesApi } & PurchasesApi;

export const PREMIUM_ENTITLEMENT = 'deeper_plus';

export interface PremiumPlan {
  /** RevenueCat package identifier — what `purchasePlan` expects back. */
  id: string;
  name: string;
  /** Localised by the store, e.g. "£19.99" or "$4.99". */
  price: string;
  period: string;
  savings?: string;
  recommended?: boolean;
}

let cachedModule: PurchasesApi | null = null;
let loadAttempted = false;
let configuredFor: string | null = null;
let premiumState = false;
let packages: Map<string, PurchasesPackage> = new Map();
let listenerAttached = false;

function getPurchases(): PurchasesApi | null {
  if (loadAttempted) return cachedModule;
  loadAttempted = true;
  try {
    const module = require('react-native-purchases') as PurchasesModule;
    // Metro/babel interop: the class is usually under `.default`.
    cachedModule = (module.default ?? module) as PurchasesApi;
    if (!cachedModule || typeof cachedModule.configure !== 'function') cachedModule = null;
  } catch {
    cachedModule = null;
  }
  if (!cachedModule && __DEV__) {
    console.log('[premium] RevenueCat native module unavailable — purchases disabled (needs a dev build)');
  }
  return cachedModule;
}

function apiKey(): string | null {
  const key =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return key && key.length > 0 ? key : null;
}

/** True when we can actually transact: native module present and a key set. */
export function purchasesAvailable(): boolean {
  return getPurchases() !== null && apiKey() !== null;
}

function isPremiumCustomer(info: CustomerInfo | null | undefined): boolean {
  if (!info) return false;
  const active = info.entitlements?.active as Record<string, unknown> | undefined;
  return Boolean(active?.[PREMIUM_ENTITLEMENT]);
}

/**
 * Configure RevenueCat once, identifying the user by the same device key the
 * server uses. That is what lets the purchase webhook attribute the sale to
 * the right `users` row.
 */
function ensureConfigured(deviceKey?: string): boolean {
  const Purchases = getPurchases();
  const key = apiKey();
  if (!Purchases || !key) return false;
  if (configuredFor === (deviceKey ?? 'anonymous')) return true;

  try {
    Purchases.configure({ apiKey: key, ...(deviceKey ? { appUserID: deviceKey } : {}) });
    configuredFor = deviceKey ?? 'anonymous';
    if (!listenerAttached) {
      // Catches renewals, refunds, billing issues and cross-device changes
      // without the app having to poll.
      Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
        premiumState = isPremiumCustomer(info);
      });
      listenerAttached = true;
    }
    return true;
  } catch (error) {
    if (__DEV__) console.log('[premium] configure failed:', error);
    return false;
  }
}

export async function loadPremiumState(deviceKey?: string): Promise<boolean> {
  const Purchases = getPurchases();
  if (!Purchases || !ensureConfigured(deviceKey)) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    premiumState = isPremiumCustomer(info);
  } catch (error) {
    if (__DEV__) console.log('[premium] getCustomerInfo failed:', error);
    premiumState = false;
  }
  return premiumState;
}

export function isPremium(): boolean {
  return premiumState;
}

function periodFor(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case 'LIFETIME':
      return 'one-time';
    case 'ANNUAL':
      return '/year';
    case 'SIX_MONTH':
      return '/6 months';
    case 'THREE_MONTH':
      return '/3 months';
    case 'TWO_MONTH':
      return '/2 months';
    case 'MONTHLY':
      return '/month';
    case 'WEEKLY':
      return '/week';
    default:
      return '';
  }
}

function toPlan(pkg: PurchasesPackage): PremiumPlan {
  const name = pkg.product.title || pkg.identifier;
  const plan: PremiumPlan = {
    id: pkg.identifier,
    name,
    price: pkg.product.priceString,
    period: periodFor(pkg),
  };
  // The discount is derived from what the store reports, never asserted by us.
  if (pkg.packageType === 'ANNUAL' && pkg.product.pricePerMonth) {
    const monthly = pkg.product.price;
    if (monthly > 0) {
      const annualEquivalent = pkg.product.pricePerMonth * 12;
      const percent = Math.round((1 - annualEquivalent / monthly) * 100);
      if (percent > 0) plan.savings = `Save ${percent}%`;
    }
  }
  return plan;
}

/**
 * Real offerings from the store. Returns an empty array when RevenueCat is not
 * reachable, which the paywall renders as an explicit "unavailable" state
 * rather than inventing prices.
 */
export async function loadPlans(deviceKey?: string): Promise<PremiumPlan[]> {
  const Purchases = getPurchases();
  if (!Purchases || !ensureConfigured(deviceKey)) return [];
  try {
    const offerings: PurchasesOfferings = await Purchases.getOfferings();
    const available = offerings.current?.availablePackages ?? [];
    packages = new Map(available.map((pkg) => [pkg.identifier, pkg]));

    const plans = available
      // StoreKit can return a duplicate identifier for intro offers.
      .filter((pkg, index, all) => all.findIndex((other) => other.identifier === pkg.identifier) === index)
      .map(toPlan)
      .sort((a, b) => {
        const rank = (id: string) => (id.includes('lifetime') ? 2 : id.includes('annual') || id.includes('year') ? 1 : 0);
        return rank(a.id) - rank(b.id);
      });

    // Recommend the annual plan — it is the one worth selling.
    const recommended = plans.find((plan) => plan.savings) ?? plans[plans.length - 1];
    if (recommended) recommended.recommended = true;
    return plans;
  } catch (error) {
    if (__DEV__) console.log('[premium] getOfferings failed:', error);
    return [];
  }
}

export class PurchaseCancelledError extends Error {
  constructor() {
    super('Purchase cancelled');
    this.name = 'PurchaseCancelledError';
  }
}

/**
 * `PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR`. Compared as a literal
 * because importing the enum would be a *value* import, which would make the
 * native module a static bundle dependency again — exactly the crash we are
 * avoiding. In SDK v10 a cancelled purchase rejects rather than returning
 * `userCancelled`.
 */
const PURCHASE_CANCELLED = '1';

function isCancellation(error: unknown): boolean {
  const candidate = error as { code?: string; userCancelled?: boolean | null } | null;
  if (!candidate) return false;
  return candidate.userCancelled === true || candidate.code === PURCHASE_CANCELLED;
}

/** Throws PurchaseCancelledError if the user backed out, so callers can stay quiet. */
export async function purchasePlan(planId: string): Promise<boolean> {
  const Purchases = getPurchases();
  if (!Purchases) return false;
  const pkg = packages.get(planId);
  if (!pkg) {
    if (__DEV__) console.log('[premium] no such package:', planId);
    return false;
  }
  try {
    const result = await Purchases.purchasePackage(pkg);
    premiumState = isPremiumCustomer(result.customerInfo);
    return premiumState;
  } catch (error) {
    if (isCancellation(error)) throw new PurchaseCancelledError();
    if (__DEV__) console.log('[premium] purchase failed:', error);
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  const Purchases = getPurchases();
  if (!Purchases || configuredFor === null) return false;
  try {
    const info = await Purchases.restorePurchases();
    premiumState = isPremiumCustomer(info);
    return premiumState;
  } catch (error) {
    if (__DEV__) console.log('[premium] restore failed:', error);
    return false;
  }
}

/**
 * "Delete my data" clears local premium state only.
 *
 * We deliberately do NOT call Purchases.logOut(): that would detach the RevenueCat
 * identity from this install, orphan the existing purchase, and make the server
 * webhook attribute future renewals to nobody. RevenueCat is the system of record
 * for entitlements; wiping it would destroy the user's paid access.
 */
export async function logoutPremium(): Promise<void> {
  premiumState = false;
}
