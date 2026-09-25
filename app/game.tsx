import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '@/src/lib/game-store';
import { PulseDot } from '@/src/lib/pulse';
import { theme } from '@/src/lib/theme';
import { RevealCountdown } from '@/src/lib/RevealCountdown';
import { ReactionBubbles } from '@/src/lib/ReactionBubbles';
import { fadeInUp } from '@/src/lib/animations';
import { showInterstitialAd } from '@/src/lib/ads';
import type { ReactionType } from '@deeper/shared';

const REACTIONS: Array<[ReactionType, string]> = [
  ['love', 'Love it'],
  ['funny', 'Thats funny'],
  ['unexpected', 'Didnt expect that'],
  ['more', 'Tell me more'],
];

interface ReactionBubble {
  id: string;
  emoji: string;
  x: number;
}

export default function GameScreen() {
  const {
    snapshot, submitAnswer, predictAnswer, reveal, react, nextQuestion,
    endGame, identity, error, connection, leaveRoom, isHost,
  } = useGame();
  const insets = useSafeAreaInsets();
  const [answer, setAnswer] = useState('');
  const [prediction, setPrediction] = useState('');
  const [showCountdown, setShowCountdown] = useState(false);
  const [bubbles, setBubbles] = useState<ReactionBubble[]>([]);

  const myId = identity?.playerId ?? '';
  const exitHome = () => { leaveRoom(); router.replace('/'); };
  const isPrediction = snapshot?.gameMode === 'prediction';

  // Entrance animations
  const fadeQuestion = useRef(new Animated.Value(0)).current;
  const fadeInput = useRef(new Animated.Value(0)).current;
  const fadeProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      fadeInUp(fadeProgress, 0, 300),
      fadeInUp(fadeQuestion, 100, 400),
      fadeInUp(fadeInput, 200, 400),
    ]).start();
  }, [snapshot?.questionNumber]);

  /* Connecting / loading */
  if (!snapshot) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.pink} />
        <Text style={styles.loadingTitle}>
          {connection === 'disconnected' ? 'Cannot reach the server' : 'Joining your conversation...'}
        </Text>
        <Text style={styles.loadingSub}>
          {connection === 'disconnected'
            ? 'Check your connection and that the game server is running.'
            : 'Getting everything in sync.'}
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.secondaryButton} onPress={exitHome}>
          <Text style={styles.secondaryText}>Back home</Text>
        </Pressable>
      </View>
    );
  }

  if (!snapshot.currentQuestion) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.pink} />
        <Text style={styles.loadingTitle}>Loading the next question...</Text>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  const submitted = snapshot.submittedPlayerIds.includes(myId);
  const revealReady = snapshot.revealedPlayerIds.includes(myId);
  const isReveal = snapshot.phase === 'REVEAL' || snapshot.phase === 'REACTIONS';
  const isEnd = snapshot.status === 'ended';
  const isComplete = snapshot.status === 'complete';

  // Trigger countdown when all answer and press reveal
  useEffect(() => {
    if (snapshot.phase === 'WAITING_FOR_REVEALS' && !revealReady) {
      setShowCountdown(false);
    }
  }, [snapshot.phase, revealReady]);

  const handleReveal = () => {
    setShowCountdown(true);
    reveal();
  };

  const handleCountdownDone = () => {
    setShowCountdown(false);
  };

  const handleReact = (reaction: ReactionType) => {
    react(reaction);
    const id = `${Date.now()}-${Math.random()}`;
    const x = Math.random() * 200 + 40;
    setBubbles((prev) => [...prev, { id, emoji: reaction, x }]);
  };

  const removeBubble = (id: string) => {
    setBubbles((prev) => prev.filter((b) => b.id !== id));
  };

  const handleSubmit = () => {
    if (isPrediction) {
      // In prediction mode, submit both answer and prediction
      submitAnswer(answer);
      predictAnswer(prediction);
    } else {
      submitAnswer(answer);
    }
    setAnswer('');
    setPrediction('');
  };

  const confirmExit = () => {
    if (isHost) {
      Alert.alert(
        'End this conversation?',
        `You are currently on question ${snapshot.questionNumber} of ${snapshot.totalQuestions}.`,
        [
          { text: 'Keep playing', style: 'cancel' },
          { text: 'End game', style: 'destructive', onPress: () => { endGame(); exitHome(); } },
        ]
      );
    } else {
      Alert.alert(
        'Leave this conversation?',
        `You are currently on question ${snapshot.questionNumber} of ${snapshot.totalQuestions}.`,
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave game', style: 'destructive', onPress: exitHome },
        ]
      );
    }
  };

  // Ad between games
  useEffect(() => {
    if (isComplete && isHost) {
      void showInterstitialAd();
    }
  }, [isComplete, isHost]);

  /* Game complete / ended */
  if (isEnd || isComplete) {
    return (
      <View style={styles.center}>
        <Text style={styles.bigHeart}>♥</Text>
        <Text style={styles.completeTitle}>
          {isComplete ? 'Conversation complete' : 'Conversation ended'}
        </Text>
        <Text style={styles.completeSub}>
          {isComplete
            ? `${snapshot.totalQuestions} questions answered.`
            : `You answered ${snapshot.questionNumber} of ${snapshot.totalQuestions} questions.`}
        </Text>

        {/* Prediction scores */}
        {isPrediction && snapshot.scores && snapshot.scores.length > 0 && (
          <View style={styles.scoresCard}>
            <Text style={styles.scoresTitle}>SCORES</Text>
            {snapshot.scores.map((s) => (
              <View key={s.playerId} style={styles.scoreRow}>
                <Text style={styles.scoreName}>{s.displayName}</Text>
                <Text style={styles.scoreValue}>{s.score}/{snapshot.totalQuestions}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.completeActions}>
          <Pressable
            style={({ pressed }) => [styles.startButton, pressed && { opacity: 0.88 }]}
            onPress={() => { leaveRoom(); router.replace('/create'); }}
          >
            <Text style={styles.startText}>Play Again</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]}
            onPress={exitHome}
          >
            <Text style={styles.secondaryText}>Home</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* Active round */
  const progress = (snapshot.questionNumber / snapshot.totalQuestions) * 100;

  return (
    <View style={{ flex: 1 }}>
      {/* Reveal countdown overlay */}
      {showCountdown && <RevealCountdown onDone={handleCountdownDone} />}

      {/* Reaction bubbles */}
      <ReactionBubbles reactions={bubbles} onComplete={removeBubble} />

      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.progressLabel}>
            QUESTION {snapshot.questionNumber} OF {snapshot.totalQuestions}
          </Text>
          <View style={styles.topRight}>
            {connection !== 'connected' && (
              <View style={styles.offlinePill}>
                <PulseDot color={theme.amber} size={6} />
                <Text style={styles.offlineText}>Reconnecting...</Text>
              </View>
            )}
            {isPrediction && (
              <View style={styles.modePill}>
                <Text style={styles.modeText}>PREDICTION</Text>
              </View>
            )}
            <Pressable accessibilityRole="button" onPress={confirmExit}>
              <Text style={styles.menu}>•••</Text>
            </Pressable>
          </View>
        </View>

        {/* Progress bar */}
        <Animated.View style={[styles.progressTrack, { opacity: fadeProgress }]}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </Animated.View>

        {/* Question */}
        <Animated.View style={{ opacity: fadeQuestion }}>
          <Text style={styles.question}>{snapshot.currentQuestion.question}</Text>
        </Animated.View>

        {/* Answering */}
        {!isReveal && !submitted && (
          <Animated.View style={{ opacity: fadeInput }}>
            <Text style={styles.label}>YOUR ANSWER</Text>
            <TextInput
              multiline
              maxLength={1000}
              value={answer}
              onChangeText={setAnswer}
              placeholder={isPrediction ? 'What do you think the answer is?' : 'Say what you really think...'}
              placeholderTextColor={theme.placeholder}
              style={styles.input}
              accessibilityLabel="Your answer"
            />

            {isPrediction && (
              <>
                <Text style={[styles.label, { marginTop: 16 }]}>YOUR PREDICTION</Text>
                <TextInput
                  multiline
                  maxLength={1000}
                  value={prediction}
                  onChangeText={setPrediction}
                  placeholder="What do you think the other player will say?"
                  placeholderTextColor={theme.placeholder}
                  style={styles.input}
                  accessibilityLabel="Your prediction"
                />
              </>
            )}

            <Text style={styles.private}>Private until everyone chooses reveal.</Text>
            <Pressable
              disabled={!answer.trim() || (isPrediction && !prediction.trim())}
              style={({ pressed }) => [
                styles.startButton,
                (!answer.trim() || (isPrediction && !prediction.trim())) && styles.startButtonDisabled,
                pressed && { opacity: 0.88 },
              ]}
              onPress={handleSubmit}
            >
              <Text style={styles.startText}>Submit answer</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Waiting */}
        {!isReveal && submitted && (
          <View style={styles.waitingCard}>
            <View style={styles.checkCircle}>
              <Text style={styles.check}>✓</Text>
            </View>
            <Text style={styles.waitingTitle}>
              {snapshot.phase === 'WAITING_FOR_REVEALS'
                ? "Everyone's answered."
                : 'Answer submitted.'}
            </Text>
            <Text style={styles.waitingSub}>
              {snapshot.phase === 'WAITING_FOR_REVEALS'
                ? 'Choose reveal when you are both ready.'
                : 'Waiting for the other players...'}
            </Text>
            {snapshot.phase === 'WAITING_FOR_REVEALS' && (
              <Pressable
                disabled={revealReady}
                style={({ pressed }) => [
                  styles.startButton,
                  revealReady && styles.startButtonDisabled,
                  pressed && !revealReady && { opacity: 0.88 },
                ]}
                onPress={handleReveal}
              >
                <Text style={styles.startText}>
                  {revealReady ? 'Reveal ready' : 'Reveal answers'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Reveal */}
        {isReveal && (
          <>
            <Text style={styles.label}>THE REVEAL</Text>

            {isPrediction && snapshot.predictions ? (
              // Prediction mode: show answers + predictions + match status
              <View style={styles.answers}>
                {snapshot.predictions.map((pred, index) => {
                  const fadeCard = useRef(new Animated.Value(0)).current;
                  useEffect(() => { fadeInUp(fadeCard, index * 200, 500).start(); }, []);
                  const predictor = snapshot.players.find((p) => p.playerId === pred.predictorId);
                  const target = snapshot.players.find((p) => p.playerId === pred.targetId);
                  return (
                    <Animated.View key={`${pred.predictorId}-${pred.targetId}`} style={[styles.answerCard, { opacity: fadeCard, transform: [{ translateY: fadeCard.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
                      <Text style={styles.answerName}>{predictor?.displayName?.toUpperCase()} PREDICTED</Text>
                      <Text style={styles.predictionText}>"{pred.prediction}"</Text>
                      <View style={styles.divider} />
                      <Text style={styles.answerName}>{target?.displayName?.toUpperCase()} SAID</Text>
                      <Text style={styles.answerText}>{pred.actual}</Text>
                      <View style={[styles.matchBadge, pred.matched ? styles.matchYes : styles.matchNo]}>
                        <Text style={styles.matchText}>{pred.matched ? 'MATCHED!' : 'No match'}</Text>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            ) : (
              // Standard mode: show answers
              <View style={styles.answers}>
                {snapshot.revealedAnswers?.map((item, index) => {
                  const fadeCard = useRef(new Animated.Value(0)).current;
                  useEffect(() => { fadeInUp(fadeCard, index * 200, 500).start(); }, []);
                  return (
                    <Animated.View key={item.playerId} style={[styles.answerCard, { opacity: fadeCard, transform: [{ translateY: fadeCard.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
                      <Text style={styles.answerName}>
                        {item.playerId === myId
                          ? 'YOUR ANSWER'
                          : `${item.displayName.toUpperCase()}'S ANSWER`}
                      </Text>
                      <Text style={styles.answerText}>{item.answer}</Text>
                    </Animated.View>
                  );
                })}
              </View>
            )}

            {/* Prediction scores */}
            {isPrediction && snapshot.scores && snapshot.scores.length > 0 && (
              <View style={styles.liveScores}>
                <Text style={styles.liveScoresTitle}>SCORES</Text>
                <View style={styles.liveScoresRow}>
                  {snapshot.scores.map((s) => (
                    <View key={s.playerId} style={styles.liveScoreItem}>
                      <Text style={styles.liveScoreName}>{s.displayName}</Text>
                      <Text style={styles.liveScoreValue}>{s.score}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.label}>REACT</Text>
            <View style={styles.reactions}>
              {REACTIONS.map(([value, label]) => (
                <Pressable
                  key={value}
                  style={({ pressed }) => [
                    styles.reaction,
                    pressed && { opacity: 0.75, backgroundColor: '#252530' },
                  ]}
                  onPress={() => handleReact(value)}
                >
                  <Text style={styles.reactionText}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.startButton, pressed && { opacity: 0.88 }]}
              onPress={nextQuestion}
            >
              <Text style={styles.startText}>
                {snapshot.questionNumber === snapshot.totalQuestions
                  ? 'Finish conversation'
                  : 'Next question'}
              </Text>
            </Pressable>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: theme.bg, padding: theme.spacing.xxl },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingTitle: { color: theme.text, fontSize: 20, fontWeight: '800', marginTop: 20, textAlign: 'center' },
  loadingSub: { color: theme.muted, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center', maxWidth: 280 },
  secondaryButton: { marginTop: 28, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 14, backgroundColor: theme.card },
  secondaryText: { color: theme.text, fontWeight: '700' },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#2A2010', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  offlineText: { color: theme.amber, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  modePill: {
    backgroundColor: 'rgba(155,92,255,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
  },
  modeText: { color: theme.purple, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  progressLabel: { color: theme.pink, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  menu: { color: theme.muted, fontSize: 20, letterSpacing: 2, paddingVertical: 4 },

  progressTrack: { backgroundColor: theme.border, height: 4, borderRadius: 2, marginTop: 14, marginBottom: 32 },
  progressFill: { backgroundColor: theme.pink, height: 4, borderRadius: 2 },

  question: { color: theme.text, fontSize: 28, lineHeight: 36, fontWeight: '800', letterSpacing: -0.5, marginBottom: 36 },

  label: { color: theme.muted, fontSize: 11, letterSpacing: 1.7, fontWeight: '900', marginBottom: 12 },
  input: {
    minHeight: 120, borderRadius: theme.radius.xl, backgroundColor: theme.card, color: theme.text,
    fontSize: 17, lineHeight: 25, padding: 18, textAlignVertical: 'top', borderWidth: 1, borderColor: theme.border,
  },
  private: { color: theme.faint, fontSize: 12, marginTop: 10 },

  waitingCard: {
    backgroundColor: theme.card, borderRadius: theme.radius.xl, padding: 28,
    alignItems: 'center', borderWidth: 1, borderColor: theme.border, marginTop: 8,
  },
  checkCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(99,230,190,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  check: { color: theme.green, fontSize: 28, fontWeight: '800' },
  waitingTitle: { color: theme.text, fontSize: 20, fontWeight: '800', marginTop: 16 },
  waitingSub: { color: theme.muted, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  answers: { gap: 12, marginBottom: 24 },
  answerCard: { backgroundColor: theme.card, borderRadius: theme.radius.xl, padding: 22, borderWidth: 1, borderColor: '#302B42' },
  answerName: { color: theme.purple, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  answerText: { color: theme.text, fontSize: 20, lineHeight: 28, fontWeight: '700', marginTop: 8 },
  predictionText: { color: theme.blue, fontSize: 18, lineHeight: 26, fontWeight: '600', marginTop: 8, fontStyle: 'italic' },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 12 },
  matchBadge: {
    alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 12,
  },
  matchYes: { backgroundColor: 'rgba(99,230,190,0.15)' },
  matchNo: { backgroundColor: 'rgba(255,135,159,0.15)' },
  matchText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  matchYesText: { color: theme.green },
  matchNoText: { color: theme.danger },

  liveScores: {
    backgroundColor: theme.surface, borderRadius: theme.radius.lg, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: theme.border,
  },
  liveScoresTitle: { color: theme.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 8 },
  liveScoresRow: { flexDirection: 'row', justifyContent: 'space-around' },
  liveScoreItem: { alignItems: 'center' },
  liveScoreName: { color: theme.text, fontSize: 12, fontWeight: '700' },
  liveScoreValue: { color: theme.pink, fontSize: 24, fontWeight: '900', marginTop: 4 },

  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  reaction: {
    backgroundColor: '#191923', borderRadius: 14, paddingVertical: 12,
    paddingHorizontal: 16, borderWidth: 1, borderColor: '#2C2C3B',
  },
  reactionText: { color: theme.text, fontSize: 13, fontWeight: '700' },

  startButton: { backgroundColor: theme.pink, padding: 18, borderRadius: 17, alignItems: 'center', marginTop: 20 },
  startButtonDisabled: { opacity: 0.35 },
  startText: { color: theme.text, fontSize: 16, fontWeight: '800' },

  error: { color: theme.danger, textAlign: 'center', marginTop: 14 },
  bigHeart: { color: theme.pink, fontSize: 56 },
  completeTitle: { color: theme.text, fontSize: 28, fontWeight: '800', marginTop: 20 },
  completeSub: { color: theme.muted, fontSize: 15, marginTop: 8, textAlign: 'center' },
  completeActions: { gap: 12, marginTop: 24, width: '100%' },

  scoresCard: {
    backgroundColor: theme.card, borderRadius: theme.radius.lg, padding: 20, marginTop: 16,
    borderWidth: 1, borderColor: theme.border, width: '100%',
  },
  scoresTitle: { color: theme.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 12, textAlign: 'center' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  scoreName: { color: theme.text, fontSize: 16, fontWeight: '700' },
  scoreValue: { color: theme.pink, fontSize: 16, fontWeight: '900' },
});
