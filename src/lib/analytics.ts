/**
 * PostHog Analytics Adapter
 *
 * Tracks product events for understanding user behavior.
 * In production, uses posthog-react-native SDK.
 * In local development, logs events to console.
 *
 * PRIVACY RULE: Never track answer text, private conversation content,
 * or sensitive personal information.
 */

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';

let initialized = false;
let distinctId = '';

export function initAnalytics(id: string): void {
  if (initialized) return;
  initialized = true;
  distinctId = id;

  if (!API_KEY) {
    console.log('[Analytics] No PostHog key configured, events will log to console only');
    return;
  }

  // In production:
  // import PostHog from 'posthog-react-native';
  // posthog = new PostHog(API_KEY, { host: HOST });

  console.log(`[Analytics] Initialized for user: ${id}`);
}

function track(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;

  const payload = { distinct_id: distinctId, ...properties };

  if (!API_KEY) {
    console.log(`[Analytics] ${event}`, payload);
    return;
  }

  // In production:
  // posthog.capture(event, payload);

  console.log(`[Analytics] ${event}`, payload);
}

// ─── App lifecycle ───
export function trackAppOpened(): void { track('app_opened'); }
export function trackOnboardingCompleted(displayName: string): void { track('onboarding_completed', { displayName }); }

// ─── Room events ───
export function trackRoomCreated(categoryId: string, maxPlayers: number): void {
  track('room_created', { category_id: categoryId, max_players: maxPlayers });
}
export function trackRoomJoined(roomCode: string): void {
  track('room_joined', { room_code_length: roomCode.length });
}
export function trackInviteShared(roomCode: string): void {
  track('invite_shared', { room_code_length: roomCode.length });
}

// ─── Game events ───
export function trackGameStarted(categoryId: string, playerCount: number): void {
  track('game_started', { category_id: categoryId, player_count: playerCount });
}
export function trackQuestionViewed(questionNumber: number, totalQuestions: number): void {
  track('question_viewed', { question_number: questionNumber, total_questions: totalQuestions });
}
export function trackAnswerSubmitted(questionNumber: number): void {
  track('answer_submitted', { question_number: questionNumber });
}
export function trackRevealReady(questionNumber: number): void {
  track('reveal_ready', { question_number: questionNumber });
}
export function trackRevealStarted(): void { track('reveal_started'); }
export function trackReactionSent(reaction: string): void { track('reaction_sent', { reaction }); }
export function trackQuestionCompleted(questionNumber: number): void {
  track('question_completed', { question_number: questionNumber });
}
export function trackGameCompleted(categoryId: string, questionsAnswered: number, playerCount: number): void {
  track('game_completed', { category_id: categoryId, questions_answered: questionsAnswered, player_count: playerCount });
}
export function trackGameEndedEarly(questionNumber: number, totalQuestions: number): void {
  track('game_ended_early', { question_number: questionNumber, total_questions: totalQuestions });
}

// ─── Player events ───
export function trackPlayerLeft(): void { track('player_left'); }
export function trackPlayerReconnected(): void { track('player_reconnected'); }

// ─── Daily question ───
export function trackDailyQuestionStarted(): void { track('daily_question_started'); }
export function trackDailyQuestionCompleted(streak: number): void {
  track('daily_question_completed', { streak });
}

// ─── Premium ───
export function trackPremiumPackViewed(packId: string): void { track('premium_pack_viewed', { pack_id: packId }); }
export function trackPaywallViewed(): void { track('paywall_viewed'); }
export function trackSubscriptionStarted(planId: string): void { track('subscription_started', { plan_id: planId }); }

// ─── Ads ───
export function trackAdImpression(adType: string): void { track('ad_impression', { ad_type: adType }); }
export function trackRewardedAdStarted(): void { track('rewarded_ad_started'); }
export function trackRewardedAdCompleted(): void { track('rewarded_ad_completed'); }
