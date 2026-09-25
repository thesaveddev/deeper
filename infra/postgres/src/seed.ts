import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://deeper:deeper@localhost:5432/deeper';

const CATEGORIES = [
  { id: 'couples', title: 'Couples', description: 'Make the familiar feel new again.', is_premium: false, is_adult: false },
  { id: 'deep', title: 'Deep Conversations', description: 'The questions beneath the questions.', is_premium: false, is_adult: false },
  { id: 'know-me', title: 'How Well Do You Know Me?', description: 'Predict, reveal, and compare.', is_premium: false, is_adult: false },
  { id: 'funny', title: 'Funny & Random', description: 'Low stakes, high smiles.', is_premium: false, is_adult: false },
  { id: 'friends', title: 'Friends', description: 'Good friends. Better stories.', is_premium: false, is_adult: false },
  { id: 'first-date', title: 'First Date', description: 'Skip the small talk.', is_premium: true, is_adult: false },
  { id: 'late-night', title: 'Midnight Conversations', description: 'For the talks that run late.', is_premium: true, is_adult: false },
  { id: 'after-dark', title: 'After Dark', description: 'A playful, age-gated deck.', is_premium: true, is_adult: true },
];

async function seed() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    for (const cat of CATEGORIES) {
      await client.query(
        `INSERT INTO categories (id, title, description, is_premium, is_adult)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [cat.id, cat.title, cat.description, cat.is_premium, cat.is_adult]
      );
      console.log(`  Seeded category: ${cat.title}`);
    }

    console.log('\nSeed complete.');
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
