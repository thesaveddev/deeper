import type { RoomSnapshot, ReactionType } from '@deeper/shared';
import { FREE_HOSTED_GAMES } from '@deeper/shared';
import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { socket } from './socket';
import { clearActiveRoom, loadActiveRoom, saveActiveRoom, type ActiveRoom } from './activeRoom';
import { loadIdentity, type LocalIdentity } from './session';
import { schedulePlayerJoinNotification } from './notifications';
import { captureError } from './sentry';
import { trackGameStarted, trackAnswerSubmitted, trackRevealReady, trackReactionSent, trackGameCompleted, trackGameEndedEarly, trackPlayerLeft, trackRoomCreated, trackRoomJoined } from './analytics';
import { consumeFreeGame, loadConsumedRooms, loadFreeGames, markRoomConsumed } from './freeGames';
import { loadPremiumState } from './premium';

interface GameContextValue {
  identity: LocalIdentity | null;
  snapshot: RoomSnapshot | null;
  error: string | null;
  connection: 'connecting' | 'connected' | 'disconnected';
  myPlayerId: string | null;
  isHost: boolean;
  freeGames: number;
  premium: boolean;
  refreshAccount: () => Promise<void>;
  reloadIdentity: () => Promise<void>;
  createRoom: (categoryId: string, displayName?: string, maxPlayers?: number) => void;
  joinRoom: (roomCode: string, displayName: string) => void;
  leaveRoom: () => void;
  startGame: () => void;
  submitAnswer: (answer: string) => void;
  predictAnswer: (prediction: string) => void;
  reveal: () => void;
  react: (reaction: ReactionType) => void;
  nextQuestion: () => void;
  endGame: () => void;
  clearError: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);
const REQUEST_TIMEOUT_MS = 8000;

export function GameProvider({ children }: PropsWithChildren) {
  const [identity, setIdentity] = useState<LocalIdentity | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const myPlayerId = useRef<string | null>(null);
  const [myPlayerIdState, setMyPlayerIdState] = useState<string | null>(null);
  const prevPlayerCount = useRef<number>(0);
  const [freeGames, setFreeGames] = useState(FREE_HOSTED_GAMES);
  const [premium, setPremium] = useState(false);
  const consumedRooms = useRef<Set<string>>(new Set());
  // The room we are sitting in, mirrored to disk so a dropped socket or a
  // backgrounded app can be recovered instead of leaving a frozen screen.
  const activeRoom = useRef<ActiveRoom | null>(null);
  const resuming = useRef(false);

  // Re-bind this socket to our existing seat. Called on every (re)connect and
  // whenever the app returns to the foreground.
  const attemptResume = useCallback(async () => {
    const room = activeRoom.current;
    if (!room || resuming.current) return;
    if (!socket.connected) return; // the `connect` handler will retry
    resuming.current = true;
    setConnection('connecting');

    const resumed = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => finish(false), REQUEST_TIMEOUT_MS);
      (socket as any).emit('session:resume', { roomId: room.roomId, playerId: room.playerId, deviceKey: room.deviceKey }, (result: any) => {
        if (result?.ok) {
          const data = result.data as RoomSnapshot | undefined;
          if (data) setSnapshot(data);
          finish(true);
          return;
        }
        const code = result?.error?.code;
        // The room is genuinely gone (expired, or the server restarted). Forget
        // it so we stop retrying, and say so instead of freezing mid-game.
        if (code === 'ROOM_EXPIRED' || code === 'RESUME_NOT_FOUND') {
          activeRoom.current = null;
          void clearActiveRoom();
          setSnapshot(null);
          setMyPlayerIdState(null);
          setError(result?.error?.message ?? 'That game is no longer available.');
        }
        finish(false);
      });
    });

    resuming.current = false;
    setConnection(socket.connected ? 'connected' : 'disconnected');
    if (resumed) setError(null);
  }, []);

  const refreshAccount = useCallback(async () => {
    const [games, isPremium] = await Promise.all([loadFreeGames(), loadPremiumState()]);
    setFreeGames(games);
    setPremium(isPremium);
  }, []);

  useEffect(() => {
    void loadIdentity().then((id) => {
      setIdentity(id);
      // If default name, prompt later
    });
    void refreshAccount();
    void loadConsumedRooms().then((ids) => {
      consumedRooms.current = new Set(ids);
    });
    // Restore the room we were in before the app was backgrounded or closed.
    void loadActiveRoom().then((room) => {
      activeRoom.current = room;
      if (room) void attemptResume();
    });

    const update = (next: RoomSnapshot) => setSnapshot(next);
    socket.on('room:snapshot', update);
    socket.on('game:started', update);
    socket.on('question:shown', update);
    socket.on('reveal:start', update);
    socket.on('question:next', update);
    socket.on('game:completed', update);
    socket.on('game:ended', update);
    socket.on('server:error', (event) => setError(event.message));

    const onConnect = () => {
      setConnection('connected');
      // A fresh socket has no room binding, so re-attach to our seat.
      void attemptResume();
    };
    const onDisconnect = () => setConnection('disconnected');
    const onConnectError = () => {
      setConnection('disconnected');
      setError('Cannot reach the game server. Check that "npm run dev" is running and your phone and computer are on the same Wi-Fi network.');
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('room:snapshot', update);
      socket.off('game:started', update);
      socket.off('question:shown', update);
      socket.off('reveal:start', update);
      socket.off('question:next', update);
      socket.off('game:completed', update);
      socket.off('game:ended', update);
      socket.off('server:error');
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [attemptResume]);

  // iOS suspends the socket when the app is backgrounded, so re-join the moment
  // the player comes back rather than making them stare at a stale round.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (!socket.connected) {
        setConnection('connecting');
        socket.connect();
      } else {
        void attemptResume();
      }
    });
    return () => subscription.remove();
  }, [attemptResume]);

  const clearError = useCallback(() => setError(null), []);

  // `identity` is needed inside `action` (to key the device account) but must
  // not re-create the callback on every keystroke in the name field.
  const identityRef = useRef<LocalIdentity | null>(null);
  identityRef.current = identity;

  const action = useCallback((event: string, payload?: unknown) => {
    setError(null);
    setConnection((state) => (state === 'connected' ? state : 'connecting'));
    if (!socket.connected) socket.connect();

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      setError('The server took too long to respond. Check: 1) Server is running (npm run dev:server), 2) EXPO_PUBLIC_SOCKET_URL in .env uses your computer LAN IP not localhost, 3) Phone and computer are on same Wi-Fi.');
    }, REQUEST_TIMEOUT_MS);

    (socket as any).emit(event, payload, (result: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!result?.ok) {
        setError(result?.error?.message ?? 'Something went wrong.');
        return;
      }
      const data = result.data as RoomSnapshot | undefined;
      if (data) {
        setSnapshot(data);
      }
      // The server now echoes the authoritative player ID for this client.
      if (result.you && typeof result.you === 'string') {
        myPlayerId.current = result.you;
        setMyPlayerIdState(result.you);
      }
      // Remember the room so a dropped connection is recoverable.
      if (data && result.you && typeof result.you === 'string') {
        const room: ActiveRoom = {
          roomId: data.roomId,
          playerId: result.you,
          roomCode: data.roomCode,
          deviceKey: identityRef.current?.playerId ?? '',
        };
        activeRoom.current = room;
        void saveActiveRoom(room);
      }
    });
  }, []);

  // Fallback: if the `you` echo was missed, resolve our player ID from the roster
  // using the local display name as a last resort.
  useEffect(() => {
    if (myPlayerId.current || !snapshot || !identity) return;
    const mine = snapshot.players.find((player) => player.displayName === identity.displayName);
    if (mine) {
      myPlayerId.current = mine.playerId;
      setMyPlayerIdState(mine.playerId);
    }
  }, [snapshot, identity]);



  // Charge exactly one free game per room, only when the server reports the game
  // as active and only for the host. Creating/cancelling, reconnecting and guests
  // are never charged.
  useEffect(() => {
    if (!snapshot || premium) return;
    if (snapshot.status !== 'active') return;
    if (!myPlayerIdState || snapshot.hostPlayerId !== myPlayerIdState) return;
    const roomId = snapshot.roomId;
    if (consumedRooms.current.has(roomId)) return;
    consumedRooms.current.add(roomId);
    void markRoomConsumed(roomId)
      .then(() => consumeFreeGame())
      .then(setFreeGames)
      .catch(() => consumedRooms.current.delete(roomId));
  }, [snapshot, premium, myPlayerIdState]);

  const leaveRoom = useCallback(() => {
    trackPlayerLeft();
    (socket as any).emit('room:leave');
    setSnapshot(null);
    myPlayerId.current = null;
    setMyPlayerIdState(null);
    activeRoom.current = null;
    void clearActiveRoom();
  }, []);

  const isHost = useMemo(
    () => Boolean(snapshot && myPlayerIdState && snapshot.hostPlayerId === myPlayerIdState),
    [snapshot, myPlayerIdState]
  );

  // Notify host when a new player joins
  useEffect(() => {
    if (!snapshot || !isHost || snapshot.status !== 'lobby') return;
    const currentCount = snapshot.players.length;
    if (currentCount > prevPlayerCount.current && prevPlayerCount.current > 0) {
      const newPlayer = snapshot.players.find((p) => p.playerId !== myPlayerId.current);
      if (newPlayer) {
        void schedulePlayerJoinNotification(newPlayer.displayName, snapshot.roomCode);
      }
    }
    prevPlayerCount.current = currentCount;
  }, [snapshot?.players.length, isHost]);

  const value = useMemo<GameContextValue>(() => ({
    identity,
    snapshot,
    error,
    connection,
    myPlayerId: myPlayerIdState,
    isHost,
    freeGames,
    premium,
    refreshAccount,
    reloadIdentity: async () => {
      setIdentity(await loadIdentity());
    },
    createRoom: (categoryId, displayName?: string, maxPlayers?: number) => {
      action('room:create', {
        categoryId,
        displayName: displayName || identity?.displayName,
        maxPlayers,
        deviceKey: identity?.playerId,
      });
      trackRoomCreated(categoryId, maxPlayers ?? 2);
    },
    joinRoom: (roomCode, displayName) => {
      action('room:join', { roomCode, displayName, deviceKey: identity?.playerId });
      trackRoomJoined(roomCode);
    },
    leaveRoom,
    startGame: () => {
      action('room:start');
      if (snapshot) trackGameStarted(snapshot.categoryId, snapshot.players.length);
    },
    submitAnswer: (answer) => {
      action('answer:submit', { answer });
      if (snapshot) trackAnswerSubmitted(snapshot.questionNumber);
    },
    predictAnswer: (prediction) => {
      action('answer:predict', { prediction });
      if (snapshot) trackAnswerSubmitted(snapshot.questionNumber);
    },
    reveal: () => {
      action('reveal:ready');
      if (snapshot) trackRevealReady(snapshot.questionNumber);
    },
    react: (reaction) => {
      action('reaction:send', { reaction });
      trackReactionSent(reaction);
    },
    nextQuestion: () => {
      if (snapshot) trackGameCompleted(snapshot.categoryId, snapshot.questionNumber, snapshot.players.length);
      action('question:next');
    },
    endGame: () => {
      if (snapshot) trackGameEndedEarly(snapshot.questionNumber, snapshot.totalQuestions);
      action('room:end');
    },
    clearError
  }), [identity, snapshot, error, connection, myPlayerIdState, isHost, freeGames, premium, refreshAccount, action, leaveRoom, clearError]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used inside GameProvider');
  return context;
}
