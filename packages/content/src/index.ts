import type { CategoryId, Question } from '@deeper/shared';

export interface Category {
  id: CategoryId;
  title: string;
  icon: string;
  description: string;
  isPremium: boolean;
  isAdult: boolean;
  minPlayers: number;
  maxPlayers: number;
}

export const categories: Category[] = [
  { id: 'couples', title: 'Couples', icon: '♡', description: 'Make the familiar feel new again.', isPremium: false, isAdult: false, minPlayers: 2, maxPlayers: 2 },
  { id: 'deep', title: 'Deep Conversations', icon: '✦', description: 'The questions beneath the questions.', isPremium: false, isAdult: false, minPlayers: 2, maxPlayers: 8 },
  { id: 'know-me', title: 'How Well Do You Know Me?', icon: '◉', description: 'Predict, reveal, and compare.', isPremium: false, isAdult: false, minPlayers: 2, maxPlayers: 2 },
  { id: 'funny', title: 'Funny & Random', icon: '☻', description: 'Low stakes, high smiles.', isPremium: false, isAdult: false, minPlayers: 2, maxPlayers: 8 },
  { id: 'friends', title: 'Friends', icon: '◌', description: 'Good friends. Better stories.', isPremium: false, isAdult: false, minPlayers: 2, maxPlayers: 8 },
  { id: 'first-date', title: 'First Date', icon: '✿', description: 'Skip the small talk.', isPremium: true, isAdult: false, minPlayers: 2, maxPlayers: 2 },
  { id: 'late-night', title: 'Midnight Conversations', icon: '☾', description: 'For the talks that run late.', isPremium: true, isAdult: false, minPlayers: 2, maxPlayers: 8 },
  { id: 'after-dark', title: 'After Dark', icon: '◒', description: 'A playful, age-gated deck.', isPremium: true, isAdult: true, minPlayers: 2, maxPlayers: 8 }
];

const prompts: Record<CategoryId, string[]> = {
  couples: [
    'What small thing do I do that makes you feel cared for?', 'What place would you love us to wander through together?',
    'Which ordinary moment with me would you happily replay?', 'What is one ritual we should invent for ourselves?',
    'What have you learned about love from us?', 'When do you feel most like a team with me?',
    'What are you quietly proud of in our relationship?', 'What would our ideal slow Sunday include?',
    'Which version of us from the past would surprise you most?', 'What is a kind thing you wish I could see in myself?',
    'What makes a disagreement feel safe for you?', 'Which future tradition sounds most like us?',
    'What is one adventure we keep talking about?', 'What helps you come back to yourself after a hard day?',
    'Which song, smell, or meal feels like our story?', 'What do you hope never becomes ordinary between us?',
    'How can I celebrate you better?', 'What does feeling at home with someone mean to you?',
    'Which date would cost almost nothing but feel perfect?', 'What should we protect more carefully in our time together?'
  ],
  deep: [
    'What part of yourself are you still learning to understand?', 'Which belief has changed most as you have grown?',
    'What does a meaningful life look like on an unremarkable Tuesday?', 'When do you feel most honest?',
    'What kind of silence feels peaceful to you?', 'What are you trying to make room for?',
    'Which lesson took you the longest to accept?', 'What do you wish people asked you more often?',
    'What is a fear that has become smaller with time?', 'Where do you notice beauty when life feels busy?',
    'What would you do differently if you trusted your timing?', 'Which memory still shapes your choices?',
    'What does being understood feel like in your body?', 'What are you unwilling to compromise on?',
    'How do you know when you need help?', 'What kind of courage are you practicing right now?',
    'What do you want your future self to thank you for?', 'Which part of adulthood surprised you?',
    'What is worth changing your mind about?', 'What would you like to forgive yourself for?'
  ],
  'know-me': [
    'What would I choose for a completely free afternoon?', 'Which meal would I order when I need comfort?',
    'What place would I most like to wake up tomorrow?', 'Which hobby would I try if embarrassment disappeared?',
    'What compliment lands deepest for me?', 'What would I save first from a perfect day?',
    'Which fictional world would I visit for a week?', 'What kind of gift would make me feel truly seen?',
    'What do I do when I need to reset?', 'Which tiny inconvenience tests my patience?',
    'What would I name a boat, band, or pet?', 'Which season feels most like my personality?',
    'What is my ideal way to celebrate good news?', 'Which skill do I secretly wish I had?',
    'What would I put in a time capsule?', 'What kind of trip would I plan with no itinerary?',
    'What would I choose for my last meal on a holiday?', 'Which room in a house would I redesign first?',
    'What makes me feel instantly welcome?', 'Which harmless opinion would I defend dramatically?'
  ],
  funny: [
    'What ridiculous rule would improve the world immediately?', 'Which animal would be the worst roommate for me?',
    'What would my warning label say?', 'What is the funniest job I could plausibly have?',
    'Which snack best represents my personality?', 'What would I be arrested for in a cartoon universe?',
    'If my life had a laugh track, when would it play?', 'What would my villain origin story be?',
    'Which object would I challenge to a duel?', 'What is the least useful superpower I would still accept?',
    'What would I name a dramatic reality show about my week?', 'Which celebrity impression would I attempt badly?',
    'What conspiracy theory could I invent about myself?', 'What would a time traveller find confusing about me?',
    'Which household chore deserves an awards ceremony?', 'What would my personal mascot do all day?',
    'Which food would win a debate against me?', 'What would I put on a very honest billboard?',
    'What is the strangest theme for a restaurant I might open?', 'Which everyday task makes me feel like an action hero?'
  ],
  friends: [
    'Which shared memory still makes you laugh before you tell it?', 'What kind of adventure should we plan this year?',
    'What do you think I am better at than I realize?', 'Which version of us would confuse our younger selves?',
    'What is our most reliable comfort plan?', 'What is something you can always count on me for?',
    'Which story about us deserves a film adaptation?', 'What friendship green flag do you value most?',
    'What have you learned from being my friend?', 'Where should our group go if money and calendars agreed?',
    'Which harmless habit of mine has become iconic?', 'What would our friendship theme song sound like?',
    'What should we celebrate more often?', 'When did you first realize we would stay friends?',
    'What challenge would we be weirdly good at together?', 'What do you hope we are still doing years from now?',
    'Which inside joke needs to be retired but never will be?', 'What is one way I make a room better?',
    'What would our ideal low-energy hangout look like?', 'What is a story you hope we tell forever?'
  ],
  'first-date': [
    'What makes a conversation feel effortless to you?', 'What is a green flag you notice quickly?',
    'Which ordinary pleasure never gets old?', 'What is something you are curious to learn this year?',
    'What does a good weekend feel like?', 'Which place would you happily return to?',
    'What is a surprisingly strong opinion you have?', 'What kind of humour always gets you?',
    'What is one thing you make time for no matter what?', 'What makes you feel instantly comfortable with someone?',
    'Which small adventure sounds perfect this month?', 'What are you looking forward to?',
    'What is a skill you admire in other people?', 'What would your friends say is unmistakably you?',
    'How do you like to celebrate a win?', 'What is a question you wish dates asked more often?',
    'Which meal would you cook to impress someone?', 'What is something you changed your mind about recently?',
    'What does a memorable night need?', 'What is a kind risk you would like to take?'
  ],
  'late-night': [
    'What thought visits you when the world gets quiet?', 'Which dream have you not said out loud enough?',
    'What do you miss from a past version of your life?', 'Where do you feel most unobserved?',
    'What would you ask your future self?', 'Which memory has a different meaning now?',
    'What do you think people misunderstand about ambition?', 'What are you learning to let be unfinished?',
    'What kind of closeness feels rare and valuable?', 'Which truth became easier after midnight?',
    'What would you do with one fearless year?', 'What do you want to remember about this season?',
    'What is a hope you protect from cynicism?', 'Which goodbye changed your direction?',
    'What makes a place feel like yours?', 'What would you tell someone who feels behind?',
    'Which question are you currently living inside?', 'What do you want to be braver about?',
    'What does rest mean beyond sleep?', 'Which part of your story deserves gentleness?'
  ],
  'after-dark': [
    'What kind of chemistry do you notice first?', 'What makes flirting feel natural rather than performative?',
    'What is your favourite way to build anticipation?', 'Which compliment would make you blush?',
    'What makes a private moment feel memorable?', 'What boundary helps you feel more playful?',
    'What is an underrated way to feel desired?', 'Which mood would you choose for a spontaneous date night?',
    'What kind of confidence do you find magnetic?', 'What makes a kiss unforgettable in a movie?',
    'What is a playful risk you would enjoy taking together?', 'How do you like someone to show clear interest?',
    'What turns an ordinary evening into a charged one?', 'What kind of teasing always stays kind?',
    'What makes you feel safe enough to be bold?', 'Which detail can change the whole atmosphere?',
    'What is a romantic surprise you would genuinely enjoy?', 'What does good consent sound like in the moment?',
    'Which shared secret would make you smile?', 'What is one way to keep curiosity alive?'
  ]
};

const variants = ['on a quiet morning', 'when plans change', 'with someone you trust', 'during a long walk', 'without needing a perfect answer'];

export const questions: Question[] = categories.flatMap((category) =>
  prompts[category.id].flatMap((prompt, promptIndex) => variants.map((variant, variantIndex) => ({
    id: `${category.id}-${promptIndex + 1}-${variantIndex + 1}`,
    categoryId: category.id,
    question: `${prompt} — ${variant}?`,
    difficulty: (promptIndex % 3 + 1) as 1 | 2 | 3,
    intensity: (category.id === 'after-dark' ? 3 : (promptIndex % 3 + 1)) as 1 | 2 | 3,
    ageRating: category.isAdult ? 'adult' : 'general',
    isAdult: category.isAdult,
    isPremium: category.isPremium,
    isActive: true
  })))
);

export function getQuestions(categoryId: CategoryId, count = 10): Question[] {
  const pool = questions.filter((question) => question.categoryId === categoryId && question.isActive);
  return Array.from({ length: Math.min(count, pool.length) }, (_, index) => pool[index % pool.length]!);
}

export function getCategory(categoryId: CategoryId): Category {
  const category = categories.find((item) => item.id === categoryId);
  if (!category) throw new Error('Unknown category');
  return category;
}
