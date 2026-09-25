export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const TOTAL_QUESTIONS = 10;
export const FREE_HOSTED_GAMES = 10;
export const MAX_ANSWER_LENGTH = 1000;

export type CategoryId = 'couples' | 'deep' | 'know-me' | 'funny' | 'friends' | 'first-date' | 'late-night' | 'after-dark';
export type RoomStatus = 'lobby' | 'active' | 'complete' | 'ended' | 'expired';
export type GamePhase = 'QUESTION_ACTIVE' | 'WAITING_FOR_ANSWERS' | 'WAITING_FOR_REVEALS' | 'REVEAL' | 'REACTIONS' | 'GAME_COMPLETE' | 'GAME_ENDED';
export type GameMode = 'standard' | 'prediction';
export type ReactionType = 'love' | 'funny' | 'unexpected' | 'more';

export interface Question {
  id: string;
  categoryId: CategoryId;
  question: string;
  difficulty: 1 | 2 | 3;
  intensity: 1 | 2 | 3;
  ageRating: 'general' | 'adult';
  isAdult: boolean;
  isPremium: boolean;
  isActive: boolean;
}

export interface Player {
  playerId: string;
  displayName: string;
  sessionId: string;
  isHost: boolean;
  connected: boolean;
  joinedAt: string;
}

export interface RoomSnapshot {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  categoryId: CategoryId;
  maxPlayers: number;
  status: RoomStatus;
  players: Player[];
  currentQuestion: Question | null;
  questionNumber: number;
  totalQuestions: number;
  phase: GamePhase | null;
  submittedPlayerIds: string[];
  revealedPlayerIds: string[];
  revealedAnswers?: Array<{ playerId: string; displayName: string; answer: string }>;
  reactions: Array<{ playerId: string; displayName: string; reaction: ReactionType }>;
  endedReason?: 'host-ended' | 'player-left' | 'expired' | 'completed';
  gameMode: GameMode;
  predictions?: Array<{ predictorId: string; targetId: string; prediction: string; actual: string; matched: boolean }>;
  scores?: Array<{ playerId: string; displayName: string; score: number }>;
}

export interface PlayerIdentity {
  playerId: string;
  displayName: string;
  sessionId: string;
  premium: boolean;
  freeHostedGamesRemaining: number;
}

export interface CreateRoomInput {
  categoryId: CategoryId;
  displayName?: string;
  maxPlayers?: number;
  ageConfirmed?: boolean;
  /** Stable device identity used to persist the account server-side. */
  deviceKey?: string;
}

export interface JoinRoomInput {
  roomCode: string;
  displayName?: string;
  /** Stable device identity used to persist the account server-side. */
  deviceKey?: string;
}

export interface ServerError {
  code: string;
  message: string;
}

export type ClientToServerEvents = {
  'room:create': (input: CreateRoomInput, callback?: Ack<RoomSnapshot>) => void;
  'room:join': (input: JoinRoomInput, callback?: Ack<RoomSnapshot>) => void;
  'room:leave': (callback?: Ack<void>) => void;
  'room:start': (callback?: Ack<RoomSnapshot>) => void;
  'room:end': (callback?: Ack<RoomSnapshot>) => void;
  'answer:submit': (input: { answer: string }, callback?: Ack<RoomSnapshot>) => void;
  'answer:predict': (input: { prediction: string }, callback?: Ack<RoomSnapshot>) => void;
  'reveal:ready': (callback?: Ack<RoomSnapshot>) => void;
  'reaction:send': (input: { reaction: ReactionType }, callback?: Ack<RoomSnapshot>) => void;
  'question:next': (callback?: Ack<RoomSnapshot>) => void;
  'session:resume': (input: { roomId: string; playerId: string; sessionId?: string; deviceKey?: string }, callback?: Ack<RoomSnapshot>) => void;
};

export type ServerToClientEvents = {
  'room:snapshot': (snapshot: RoomSnapshot) => void;
  'room:player-status': (payload: { playerId: string; connected: boolean }) => void;
  'game:started': (snapshot: RoomSnapshot) => void;
  'question:shown': (snapshot: RoomSnapshot) => void;
  'answer:status': (payload: { playerId: string; submitted: boolean; allSubmitted: boolean }) => void;
  'reveal:ready': (payload: { playerId: string; ready: boolean; allReady: boolean }) => void;
  'reveal:start': (snapshot: RoomSnapshot) => void;
  'reaction:received': (payload: { playerId: string; displayName: string; reaction: ReactionType }) => void;
  'question:next': (snapshot: RoomSnapshot) => void;
  'game:completed': (snapshot: RoomSnapshot) => void;
  'game:ended': (snapshot: RoomSnapshot) => void;
  'host:transferred': (payload: { playerId: string; displayName: string }) => void;
  'server:error': (error: ServerError) => void;
};

export type Ack<T> = (result: { ok: true; data: T; you?: string } | { ok: false; error: ServerError }) => void;
