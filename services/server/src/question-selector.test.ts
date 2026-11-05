/**
 * The no-repeat window.
 *
 * The interesting behaviour is the failure path: a database outage must
 * degrade to a plain shuffled draw, never to a rejected room and never back to
 * the old deterministic head-of-pool selection.
 */

import { describe, expect, it } from 'vitest';
import { NO_REPEAT_WINDOW_GAMES, selectQuestions } from './question-selector.js';
import { poolIds, questions } from '@deeper/content';
import { TOTAL_QUESTIONS } from '@deeper/shared';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('selectQuestions', () => {
  it('asks for the whole window of recent games', async () => {
    let asked: number | null = null;
    await selectQuestions('couples', {
      recent: async (_c, games) => {
        asked = games;
        return [];
      },
    });
    expect(asked).toBe(NO_REPEAT_WINDOW_GAMES);
  });

  it('avoids every question the caller excluded', async () => {
    const exclude = poolIds('couples').slice(0, 90);
    const picked = await selectQuestions('couples', {
      recent: async () => exclude,
      rng: seeded(11),
    });
    expect(picked).toHaveLength(TOTAL_QUESTIONS);
    expect(picked.filter((q) => exclude.includes(q.id))).toHaveLength(0);
  });

  it('degrades to a shuffled draw when the lookup fails', async () => {
    const picked = await selectQuestions('friends', {
      recent: async () => {
        throw new Error('DB_UNAVAILABLE');
      },
      rng: seeded(13),
    });
    // Still a full, well-formed game. The outage must not shorten it, and must
    // not hand back the old deterministic first-ten.
    expect(picked).toHaveLength(TOTAL_QUESTIONS);
    expect(new Set(picked.map((q) => q.id)).size).toBe(TOTAL_QUESTIONS);
    const ids = picked.map((q) => q.id);
    expect(ids).not.toEqual(questions.filter((q) => q.categoryId === 'friends').slice(0, 10).map((q) => q.id));
  });

  it('produces different games on consecutive calls', async () => {
    const first = await selectQuestions('deep', { recent: async () => [], rng: seeded(1) });
    const second = await selectQuestions('deep', { recent: async () => [], rng: seeded(2) });
    expect(first.map((q) => q.id)).not.toEqual(second.map((q) => q.id));
  });

  it('never returns a short game even when everything is excluded', async () => {
    const picked = await selectQuestions('after-dark', {
      recent: async () => poolIds('after-dark'),
      rng: seeded(17),
    });
    expect(picked).toHaveLength(TOTAL_QUESTIONS);
  });
});
