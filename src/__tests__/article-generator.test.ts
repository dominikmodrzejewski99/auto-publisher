import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateArticle, validateArticle } from '../articles/article-generator.js';
import * as openrouter from '../ai/openrouter.js';

vi.mock('../ai/openrouter.js');
const mockCallOpenRouter = vi.mocked(openrouter.callOpenRouter);

describe('generateArticle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate article HTML from topic', async () => {
    const htmlContent = `<h1>Test Article Title</h1>
<p>Intro paragraph with enough words to pass validation. ${'Lorem ipsum dolor sit amet. '.repeat(80)}</p>
<h2>Section One</h2>
<p>Content for section one with practical advice.</p>
<h2>Section Two</h2>
<p>Content for section two.</p>
<h2>Section Three</h2>
<p>Content for section three.</p>
<div class="info-box"><h3>Tip</h3><p>A useful tip.</p></div>
<h2>Podsumowanie</h2>
<p>Summary paragraph.</p>`;

    mockCallOpenRouter.mockResolvedValueOnce(htmlContent);

    const result = await generateArticle({
      apiKey: 'test-key',
      topic: {
        title: 'Test Article Title',
        slug: 'test-article',
        metaDescription: 'A test article description that is between 150 and 160 characters long for SEO purposes and optimization.',
        keywords: ['test', 'article'],
        category: 'Test',
      },
    });

    expect(result.content).toContain('<h1>');
    expect(result.headings.length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateArticle', () => {
  it('should pass for valid article', () => {
    const content = `<h1>Title</h1><p>${'word '.repeat(1600)}</p><h2>A</h2><h2>B</h2><h2>C</h2>`;
    const result = validateArticle({ content, wordCount: 1600, headings: ['A', 'B', 'C'], faqItems: [] });
    expect(result.valid).toBe(true);
  });

  it('should fail for article with too few words', () => {
    const content = '<h1>Title</h1><p>Short.</p><h2>A</h2><h2>B</h2><h2>C</h2>';
    const result = validateArticle({ content, wordCount: 50, headings: ['A', 'B', 'C'], faqItems: [] });
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('Article too short: 50 words (minimum 1500)');
  });

  it('should fail for article with fewer than 3 H2 headings', () => {
    const content = `<h1>Title</h1><p>${'word '.repeat(1600)}</p><h2>A</h2><h2>B</h2>`;
    const result = validateArticle({ content, wordCount: 1600, headings: ['A', 'B'], faqItems: [] });
    expect(result.valid).toBe(false);
  });
});
