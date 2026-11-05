/**
 * Question selection with a no-repeat window.
 *
 * The draw itself lives in @deeper/content. This module supplies the exclusion
 * set, which means answering one question the database cannot answer: which
 * questions did the last few games of this deck already use?
 *
 * `games` and `game_questions` already record that, so no new table is needed.
 *
 * Every failure path here degrades to a plain shuffled draw rather than
 * propagating. A game that cannot reach Postgres should still be playable, and
 * the difference between "random" and "random, avoiding the last ten games" is
 * a nicety rather than a correctness requirement.
 */

import { getQuestions, type Rng } from '@deeper/content';
import { TOTAL_QUESTIONS, type CategoryId, type Question } from '@deeper/shared';
import { recentlyPlayedQuestionIds } from './persistence.js';

/**
 * How many recent games of a deck to avoid.
 *
 * Each deck holds 100 questions and a game uses 10, so 10 is the largest window
 * that still guarantees a full cycle: after ten games, every question in the
 * deck has been used once, and the eleventh game starts the cycle again. Going
 * higher than this excludes the entire pool and changes nothing.
 */
export const NO_REPEAT_WINDOW_GAMES = 10;

export interface SelectQuestionsDeps {
  /** Overridable so the fallback path can be tested without a database. */
  recent?: (categoryId: CategoryId, games: number) => Promise<string[]>;
  rng?: Rng;
}

export async function selectQuestions(
  categoryId: CategoryId,
  deps: SelectQuestionsDeps = {},
  count: number = TOTAL_QUESTIONS,
): Promise<Question[]> {
  const recent = deps.recent ?? recentlyPlayedQuestionIds;
  let exclude: ReadonlySet<string> | undefined;
  try {
    exclude = new Set(await recent(categoryId, NO_REPEAT_WINDOW_GAMES));
  } catch (error) {
    // Logged rather than swallowed silently: a database problem here should be
    // visible, but it must not stop somebody from playing a game.
    console.warn('[questions] no-repeat lookup failed, drawing without it', error);
    exclude = undefined;
  }
  return getQuestions(categoryId, count, { exclude, rng: deps.rng });
}
