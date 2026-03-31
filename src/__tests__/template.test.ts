import { describe, it, expect } from 'vitest';
import { assembleHtml } from '../articles/template.js';
import type { Topic, UnsplashImage } from '../types.js';

describe('assembleHtml', () => {
  const topic: Topic = {
    title: 'Bali w 10 dni',
    slug: 'bali-10-dni',
    metaDescription: 'Plan podróży na Bali w 10 dni.',
    keywords: ['bali', 'plan podróży'],
    category: 'Bali',
  };

  const images: UnsplashImage[] = [
    { url: 'https://images.unsplash.com/photo-1?w=1200', alt: 'Bali beach', credit: 'John Doe' },
    { url: 'https://images.unsplash.com/photo-2?w=1200', alt: 'Ubud temple', credit: 'Jane Doe' },
  ];

  const content = `<h1>Bali w 10 dni</h1>
<p>Intro paragraph.</p>
<h2>Dzień 1-3: Ubud</h2>
<p>Ubud content.</p>
<h2>Dzień 4-7: Seminyak</h2>
<p>Seminyak content.</p>
<h2>Podsumowanie</h2>
<p>Summary.</p>`;

  it('should produce valid HTML with inline styles', () => {
    const html = assembleHtml({ topic, content, images, headings: ['Dzień 1-3: Ubud', 'Dzień 4-7: Seminyak', 'Podsumowanie'], faqItems: [] });
    expect(html).toContain('class="blog-article-container"');
    expect(html).toContain('font-family');
  });

  it('should generate table of contents from headings', () => {
    const html = assembleHtml({ topic, content, images, headings: ['Dzień 1-3: Ubud', 'Dzień 4-7: Seminyak', 'Podsumowanie'], faqItems: [] });
    expect(html).toContain('class="table-of-contents"');
    expect(html).toContain('Dzień 1-3: Ubud');
    expect(html).toContain('href="#');
  });

  it('should insert hero image after H1', () => {
    const html = assembleHtml({ topic, content, images, headings: ['Dzień 1-3: Ubud', 'Dzień 4-7: Seminyak', 'Podsumowanie'], faqItems: [] });
    const h1Index = html.indexOf('</h1>');
    const imgIndex = html.indexOf('<img');
    expect(imgIndex).toBeGreaterThan(h1Index);
  });

  it('should include Unsplash attribution', () => {
    const html = assembleHtml({ topic, content, images, headings: ['A', 'B', 'C'], faqItems: [] });
    expect(html).toContain('Unsplash');
  });
});
