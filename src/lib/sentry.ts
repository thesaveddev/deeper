/**
 * Sentry Error Monitoring Adapter
 *
 * This module abstracts the Sentry integration. In production, it uses
 * @sentry/react-native. In local development, it logs errors to console.
 *
 * To activate real Sentry:
 * 1. Install @sentry/react-native
 * 2. Replace the mock implementation with the real SDK calls
 * 3. Set EXPO_PUBLIC_SENTRY_DSN in .env
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  if (!DSN) {
    console.log('[Sentry] No DSN configured, errors will log to console only');
    return;
  }

  // In production:
  // import * as Sentry from '@sentry/react-native';
  // Sentry.init({ dsn: DSN, tracesSampleRate: 0.2 });

  console.log(`[Sentry] Initialized with DSN: ${DSN.substring(0, 20)}...`);
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!initialized) initSentry();

  if (!DSN) {
    console.error('[Sentry] Error:', error.message, context ?? '');
    return;
  }

  // In production:
  // Sentry.captureException(error, { extra: context });

  console.error('[Sentry] Captured:', error.message, context ?? '');
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!initialized) initSentry();

  if (!DSN) {
    console.log(`[Sentry] ${level}: ${message}`);
    return;
  }

  // In production:
  // Sentry.captureMessage(message, level);

  console.log(`[Sentry] ${level}: ${message}`);
}

export function setUserContext(userId: string, displayName?: string): void {
  // In production:
  // Sentry.setUser({ id: userId, username: displayName });
  console.log(`[Sentry] User: ${userId} (${displayName ?? 'unknown'})`);
}
