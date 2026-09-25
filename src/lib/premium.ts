/**
 * DEEPER+ Premium Adapter
 *
 * This module abstracts the RevenueCat integration. In production, it uses
 * the RevenueCat SDK. In local development, it uses a mock that persists
 * the premium state to AsyncStorage so the UI can be tested end-to-end.
 *
 * To activate real RevenueCat:
 * 1. Install react-native-purchases
 * 2. Replace the mock implementation with the real SDK calls
 * 3. Set EXPO_PUBLIC_REVENUECAT_IOS_KEY and EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PremiumPlan {
  id: string;
  name: string;
  price: string;
  period: string;
  savings?: string;
  recommended?: boolean;
}

export const PLANS: PremiumPlan[] = [
  { id: 'monthly', name: 'Monthly', price: '£2.99', period: '/month' },
  { id: 'yearly', name: 'Annual', price: '£19.99', period: '/year', savings: 'Save 44%', recommended: true },
  { id: 'lifetime', name: 'Lifetime', price: '£24.99', period: 'one-time' },
];

export const PREMIUM_ENTITLEMENT = 'deeper_plus';

const STORAGE_KEY = 'deeper.premium';

let premiumState = false;

export async function loadPremiumState(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  premiumState = stored === 'true';
  return premiumState;
}

export function isPremium(): boolean {
  return premiumState;
}

export async function purchasePlan(planId: string): Promise<boolean> {
  // Mock: mark as premium and persist
  premiumState = true;
  await AsyncStorage.setItem(STORAGE_KEY, 'true');
  return true;
}

export async function restorePurchases(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  premiumState = stored === 'true';
  return premiumState;
}

export async function logoutPremium(): Promise<void> {
  premiumState = false;
  await AsyncStorage.removeItem(STORAGE_KEY);
}
