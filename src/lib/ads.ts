/**
 * AdMob Adapter for DEEPER
 *
 * This module abstracts the Google AdMob integration. In production, it uses
 * the react-native-google-mobile-ads SDK. In local development, it logs calls.
 *
 * Ad placement strategy (from spec):
 * - Between games only (after game completes, before next starts)
 * - Never during: answering, reveal, mid-question, immediately after submit
 * - Premium users: NO ads
 * - Guests: NO ads (only hosts see ads)
 * - Early exit: NO forced ad
 */

import { isPremium } from './premium';

let adsEnabled = true;

export function setAdsEnabled(enabled: boolean) {
  adsEnabled = enabled;
}

export function areAdsEnabled(): boolean {
  return adsEnabled;
}

/**
 * Show an interstitial ad between games.
 * Returns true if ad was shown, false if skipped (premium or ads disabled).
 */
export async function showInterstitialAd(): Promise<boolean> {
  if (isPremium() || !adsEnabled) {
    return false;
  }

  // In production, call:
  // await InterstitialAd.requestAd();
  // await InterstitialAd.showAd();

  console.log('[AdMob] Interstitial ad would show here (mock)');
  return true;
}

/**
 * Show a rewarded ad for bonus content.
 * Returns true if ad was completed, false if skipped.
 */
export async function showRewardedAd(): Promise<boolean> {
  if (isPremium() || !adsEnabled) {
    return false;
  }

  // In production, call:
  // await RewardedAd.requestAd();
  // await RewardedAd.showAd();

  console.log('[AdMob] Rewarded ad would show here (mock)');
  return true;
}

/**
 * Initialize AdMob SDK.
 * Call once on app start.
 */
export async function initAdMob(): Promise<void> {
  if (!adsEnabled) return;

  // In production:
  // await mobileAds().initialize();

  console.log('[AdMob] Initialized (mock)');
}

/**
 * Check if consent is required (GDPR).
 */
export async function requestConsent(): Promise<void> {
  // In production, useUMP SDK for consent
  console.log('[AdMob] Consent check (mock)');
}
