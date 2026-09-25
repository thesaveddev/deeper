import { categories, questions } from './index.js';

describe('question catalog', () => {
  it('contains 100 questions for each of eight categories', () => {
    expect(categories).toHaveLength(8);
    expect(questions).toHaveLength(800);
    for (const category of categories) {
      expect(questions.filter((question) => question.categoryId === category.id)).toHaveLength(100);
    }
  });

  it('marks only the adult deck as adult', () => {
    expect(questions.filter((question) => question.isAdult).every((question) => question.categoryId === 'after-dark')).toBe(true);
  });
});
