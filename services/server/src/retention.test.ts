/**
 * Unit coverage for the retention window configuration.
 *
 * The purge SQL itself is exercised against a real database in CI, but the part
 * that can do irreversible damage is the config parsing: a deployment that sets
 * RETENTION_DAYS_GAMEPLAY=0 (or a typo like RETENTION_DAYS_GAMEPLAY=30d) must not
 * silently wipe every row we hold. These tests pin that behaviour.
 */

import { describe, expect, it } from 'vitest';
import { resolveRetentionWindows } from './retention.js';

const env = (values: Record<string, string | undefined>) =>
  values as NodeJS.ProcessEnv;

describe('resolveRetentionWindows', () => {
  it('defaults to 90 days of gameplay history and 365 of webhook records', () => {
    const windows = resolveRetentionWindows(env({}));
    expect(windows.gameplayDays).toBe(90);
    expect(windows.webhookDays).toBe(365);
  });

  it('honours explicit overrides', () => {
    const windows = resolveRetentionWindows(
      env({ RETENTION_DAYS_GAMEPLAY: '30', RETENTION_DAYS_WEBHOOKS: '180' }),
    );
    expect(windows.gameplayDays).toBe(30);
    expect(windows.webhookDays).toBe(180);
  });

  it('refuses zero — the value that would delete all history immediately', () => {
    expect(resolveRetentionWindows(env({ RETENTION_DAYS_GAMEPLAY: '0' })).gameplayDays).toBe(90);
    expect(resolveRetentionWindows(env({ RETENTION_DAYS_WEBHOOKS: '0' })).webhookDays).toBe(365);
  });

  it('refuses negative and non-numeric values rather than coercing them', () => {
    expect(resolveRetentionWindows(env({ RETENTION_DAYS_GAMEPLAY: '-7' })).gameplayDays).toBe(90);
    expect(resolveRetentionWindows(env({ RETENTION_DAYS_GAMEPLAY: '30d' })).gameplayDays).toBe(90);
    expect(resolveRetentionWindows(env({ RETENTION_DAYS_GAMEPLAY: '' })).gameplayDays).toBe(90);
    expect(resolveRetentionWindows(env({ RETENTION_DAYS_WEBHOOKS: 'NaN' })).webhookDays).toBe(365);
  });

  it('refuses absurdly long windows that would mean the promise is not kept', () => {
    expect(resolveRetentionWindows(env({ RETENTION_DAYS_GAMEPLAY: '100000' })).gameplayDays).toBe(90);
  });

  it('truncates fractional days instead of passing them to make_interval', () => {
    expect(resolveRetentionWindows(env({ RETENTION_DAYS_GAMEPLAY: '30.9' })).gameplayDays).toBe(30);
  });

  it('ignores a purge interval below one minute', () => {
    expect(resolveRetentionWindows(env({ RETENTION_PURGE_INTERVAL_MS: '10' })).intervalMs)
      .toBe(6 * 60 * 60 * 1000);
    expect(resolveRetentionWindows(env({ RETENTION_PURGE_INTERVAL_MS: '60000' })).intervalMs)
      .toBe(60_000);
  });
});
