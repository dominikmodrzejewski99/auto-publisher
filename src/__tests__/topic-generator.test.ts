import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateTopics } from '../topics/topic-generator.js';
import * as openrouter from '../ai/openrouter.js';

vi.mock('../ai/openrouter.js');
const mockCallOpenRouter = vi.mocked(openrouter.callOpenRouter);

describe('generateTopics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate 3 topics from trends and categories', async () => {
    const aiResponse = JSON.stringify([
      {
        title: 'Bali w 10 dni: Gotowy plan podróży',
        slug: 'bali-10-dni-plan-podrozy',
        metaDescription: 'Planujesz 10 dni na Bali? Odkryj gotowy plan podróży z Ubud, Seminyak i Nusa Penida.',
        keywords: ['bali 10 dni', 'plan podróży bali', 'ubud'],
        category: 'Bali',
      },
      {
        title: 'Santorini budżetowo: Jak zaoszczędzić na greckiej wyspie',
        slug: 'santorini-budzetowo',
        metaDescription: 'Santorini nie musi być drogie. Poznaj sprawdzone sposoby na tanie wakacje na Santorini.',
        keywords: ['santorini budżetowo', 'tanie wakacje grecja'],
        category: 'Grecja',
      },
      {
        title: 'Bangkok street food: 15 dań, które musisz spróbować',
        slug: 'bangkok-street-food-15-dan',
        metaDescription: 'Bangkok to raj dla foodies. Odkryj 15 dań street food, które musisz spróbować w Tajlandii.',
        keywords: ['bangkok street food', 'jedzenie tajlandia'],
        category: 'Tajlandia',
      },
    ]);

    mockCallOpenRouter.mockResolvedValueOnce(aiResponse);

    const topics = await generateTopics({
      apiKey: 'test-key',
      trends: { dailyTrends: ['Bali wakacje'], relatedQueries: { Bali: ['bali hotel'] } },
      categories: [{ name: 'Bali', keywords: ['bali'] }],
      publishedSlugs: ['some-old-article'],
      count: 3,
    });

    expect(topics).toHaveLength(3);
    expect(topics[0].title).toBeDefined();
    expect(topics[0].slug).toBeDefined();
    expect(topics[0].metaDescription).toBeDefined();
    expect(topics[0].keywords.length).toBeGreaterThan(0);
  });

  it('should filter out already published slugs', async () => {
    const aiResponse = JSON.stringify([
      { title: 'A', slug: 'already-published', metaDescription: 'x'.repeat(150), keywords: ['a'], category: 'Bali' },
      { title: 'B', slug: 'new-article', metaDescription: 'y'.repeat(150), keywords: ['b'], category: 'Bali' },
    ]);

    mockCallOpenRouter.mockResolvedValueOnce(aiResponse);

    const topics = await generateTopics({
      apiKey: 'test-key',
      trends: { dailyTrends: [], relatedQueries: {} },
      categories: [{ name: 'Bali', keywords: ['bali'] }],
      publishedSlugs: ['already-published'],
      count: 3,
    });

    expect(topics.every((t) => t.slug !== 'already-published')).toBe(true);
  });
});
