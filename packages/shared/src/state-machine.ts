import { GamePhase, MIN_PLAYERS, RoomStatus } from './types.js';

export function canStartGame(status: RoomStatus, playerCount: number): boolean {
  return status === 'lobby' && playerCount >= MIN_PLAYERS;
}

export function phaseAfterAnswerSubmission(submitted: number, participants: number): GamePhase {
  return submitted >= participants ? 'WAITING_FOR_REVEALS' : 'WAITING_FOR_ANSWERS';
}

export function phaseAfterRevealReady(ready: number, participants: number): GamePhase {
  return ready >= participants ? 'REVEAL' : 'WAITING_FOR_REVEALS';
}

export function nextQuestionState(questionNumber: number, totalQuestions: number): { status: RoomStatus; phase: GamePhase; questionNumber: number } {
  if (questionNumber >= totalQuestions) {
    return { status: 'complete', phase: 'GAME_COMPLETE', questionNumber };
  }
  return { status: 'active', phase: 'QUESTION_ACTIVE', questionNumber: questionNumber + 1 };
}
