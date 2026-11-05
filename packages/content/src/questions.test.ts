/**
 * Question selection.
 *
 * These exist because the previous implementation was deterministic: it walked
 * the pool from index 0, so every game of a deck played the identical ten
 * questions and 90% of the catalogue was unreachable. A regression here would
 * be invisible in a smoke test — the game still works, it just gets boring —
 * so the properties are asserted directly.
 */

import { describe, expect, it } from 'vitest';
import { TOTAL_QUESTIONS } from '@deeper/shared';
import { getQuestions, poolIds, questions, categories } from './index.js';

/** A deterministic RNG, so a failure is reproducible. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('getQuestions', () => {
  it('returns the requested number of questions', () => {
    for (const category of categories) {
      expect(getQuestions(category.id, TOTAL_QUESTIONS)).toHaveLength(TOTAL_QUESTIONS);
    }
  });

  it('returns only questions from the requested deck', () => {
    const picked = getQuestions('funny', TOTAL_QUESTIONS);
    expect(picked.every((q) => q.categoryId === 'funny')).toBe(true);
  });

  it('never returns a duplicate within one game', () => {
    const picked = getQuestions('friends', TOTAL_QUESTIONS);
    expect(new Set(picked.map((q) => q.id)).size).toBe(picked.length);
  });

  it('does not return the same game twice in a row', () => {
    // The bug this guards: identical ids for game 1 and game 2.
    for (let seed = 1; seed <= 25; seed += 1) {
      const first = getQuestions('couples', TOTAL_QUESTIONS, { rng: seeded(seed) }).map((q) => q.id);
      const second = getQuestions('couples', TOTAL_QUESTIONS, { rng: seeded(seed + 1000) }).map((q) => q.id);
      expect(second).not.toEqual(first);
    }
  });

  it('varies across many draws', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed += 1) {
      seen.add(getQuestions('deep', TOTAL_QUESTIONS, { rng: seeded(seed) }).map((q) => q.id).join(','));
    }
    // 200 draws from 100 choose 10 has an astronomical number of outcomes. A low
    // count would mean the shuffle is not actually shuffling.
    expect(seen.size).toBeGreaterThan(150);
  });

  it('reaches the whole deck over enough draws', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 500; seed += 1) {
      for (const q of getQuestions('deep', TOTAL_QUESTIONS, { rng: seeded(seed) })) seen.add(q.id);
    }
    expect(seen.size).toBe(poolIds('deep').length);
  });

  it('spreads across base prompts rather than exhausting the first few', () => {
    const basePrompts = new Set<string>();
    for (const q of getQuestions('couples', TOTAL_QUESTIONS, { rng: seeded(7) })) {
      basePrompts.add(q.id.split('-').slice(0, 2).join('-'));
    }
    // The old code used 2 of 20. Anything under 4 means the draw is still
    // clustering on the head of the pool.
    expect(basePrompts.size).toBeGreaterThanOrEqual(4);
  });

  it('honours the exclusion set', () => {
    const excluded = new Set(poolIds('couples').slice(0, 90));
    const picked = getQuestions('couples', TOTAL_QUESTIONS, { exclude: excluded, rng: seeded(3) });
    const usedExcluded = picked.filter((q) => excluded.has(q.id));
    // 90 of 100 excluded, 10 wanted: exactly the 10 fresh ones, no top-up.
    expect(usedExcluded).toHaveLength(0);
    expect(new Set(picked.map((q) => q.id))).toEqual(new Set(poolIds('couples').slice(90)));
  });

  it('tops up from the excluded set rather than returning a short game', () => {
    const excluded = new Set(poolIds('couples'));
    const picked = getQuestions('couples', TOTAL_QUESTIONS, { exclude: excluded, rng: seeded(5) });
    // Everything is excluded, so the game must still be full length.
    expect(picked).toHaveLength(TOTAL_QUESTIONS);
  });

  it('returns a short game only when the deck itself is short', () => {
    const excluded = new Set(poolIds('late-night').slice(0, 95));
    const picked = getQuestions('late-night', 10, { exclude: excluded, rng: seeded(9) });
    expect(picked).toHaveLength(10);
  });

  it('does not mutate the exported catalogue', () => {
    const before = questions.map((q) => q.id).join(',');
    getQuestions('funny', TOTAL_QUESTIONS, { exclude: new Set(poolIds('funny').slice(0, 50)) });
    expect(questions.map((q) => q.id).join(',')).toBe(before);
  });

  it('is stable under a fixed rng', () => {
    const a = getQuestions('know-me', TOTAL_QUESTIONS, { rng: seeded(42) }).map((q) => q.id);
    const b = getQuestions('know-me', TOTAL_QUESTIONS, { rng: seeded(42) }).map((q) => q.id);
    expect(a).toEqual(b);
  });
});

describe('poolIds', () => {
  it('lists every active question in a deck', () => {
    for (const category of categories) {
      const expected = questions.filter((q) => q.categoryId === category.id && q.isActive).length;
      expect(poolIds(category.id)).toHaveLength(expected);
    }
  });
});
