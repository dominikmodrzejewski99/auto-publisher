import type { Topic, UnsplashImage } from '../types.js';

interface AssembleOptions {
  topic: Topic;
  content: string;
  images: UnsplashImage[];
  headings: string[];
}

const INLINE_STYLES = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap');
  html { scroll-behavior: smooth; }
  body { margin: 0; padding: 0; background-color: #f9f9f9; }
  .blog-article-container { font-family: 'Lato', sans-serif; line-height: 1.7; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #ffffff; }
  .blog-article-container h1, .blog-article-container h2, .blog-article-container h3 { font-weight: 700; color: #1a1a1a; }
  .blog-article-container h1 { font-size: 2.5em; margin-bottom: 0.5em; line-height: 1.2; }
  .blog-article-container h2 { font-size: 2em; margin-top: 1.5em; margin-bottom: 0.8em; border-bottom: 3px solid #fbc02d; padding-bottom: 8px; }
  .blog-article-container h3 { font-size: 1.5em; margin-top: 1.2em; margin-bottom: 0.5em; }
  .blog-article-container p, .blog-article-container li { font-size: 1.1em; margin-bottom: 1em; }
  .blog-article-container ul { padding-left: 20px; }
  .blog-article-container img { width: 100%; height: auto; border-radius: 12px; margin: 20px 0; box-shadow: 0 8px 20px rgba(0,0,0,0.12); background-color: #f0f0f0; }
  .blog-article-container a { color: #000; text-decoration: none; font-weight: 700; transition: color 0.2s; }
  .blog-article-container a:hover { color: #1976d2; text-decoration: underline; }
  .info-box { border: 1px solid #fbc02d; border-left: 5px solid #fbc02d; border-radius: 8px; padding: 20px; margin-top: 30px; background-color: #fffde7; }
  .info-box.danger { border-left: 5px solid #d32f2f; background-color: #ffebee; }
  .info-box h3 { margin-top: 0; }
  .table-of-contents { background-color: #f9f9f9; border: 1px solid #e0e0e0; border-left: 5px solid #fbc02d; padding: 20px; margin: 25px 0; border-radius: 8px; }
  .table-of-contents h3 { margin-top: 0; margin-bottom: 15px; font-size: 1.6em; color: #1a1a1a; }
  .table-of-contents ul { list-style-type: none; padding: 0; }
  .table-of-contents li { margin-bottom: 10px; }
  .table-of-contents a { font-size: 1.1em; text-decoration: none; color: #0d47a1; font-weight: 700; }
  .table-of-contents a:hover { text-decoration: underline; }
</style>`;

export function assembleHtml(options: AssembleOptions): string {
  const { topic, content, images, headings } = options;

  // Add IDs to H2 headings in content
  let processedContent = addHeadingIds(content);

  // Insert hero image after H1
  if (images.length > 0) {
    processedContent = insertHeroImage(processedContent, images[0]);
  }

  // Insert images before H2 sections
  processedContent = insertSectionImages(processedContent, images.slice(1));

  // Build table of contents
  const toc = buildTableOfContents(headings);

  // Insert ToC after hero image (or after H1 if no image)
  processedContent = insertTocAfterIntro(processedContent, toc);

  // Add attribution
  const credits = images.map((img) => img.credit).filter(Boolean);
  const attribution = credits.length > 0
    ? `<p style="font-size: 0.85em; color: #999; margin-top: 40px;">Zdjęcia: <a href="https://unsplash.com" target="_blank" rel="noopener">Unsplash</a></p>`
    : '';

  return `${INLINE_STYLES}
<div class="blog-article-container">
${processedContent}
${attribution}
</div>`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => {
      const map: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
      return map[c] || c;
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function addHeadingIds(html: string): string {
  return html.replace(/<h2([^>]*)>(.*?)<\/h2>/gi, (_match, attrs, text) => {
    const plainText = text.replace(/<[^>]*>/g, '').trim();
    const id = slugify(plainText);
    return `<h2${attrs} id="${id}">${text}</h2>`;
  });
}

function insertHeroImage(html: string, image: UnsplashImage): string {
  const imgTag = `<img src="${image.url}" alt="${image.alt}">`;
  return html.replace(/<\/h1>/, `</h1>\n${imgTag}`);
}

function insertSectionImages(html: string, images: UnsplashImage[]): string {
  let imageIndex = 0;
  return html.replace(/<h2/g, (match) => {
    if (imageIndex < images.length) {
      const img = images[imageIndex];
      imageIndex++;
      return `<img src="${img.url}" alt="${img.alt}">\n${match}`;
    }
    return match;
  });
}

function buildTableOfContents(headings: string[]): string {
  const items = headings
    .map((h) => {
      const id = slugify(h);
      return `<li><a href="#${id}">${h}</a></li>`;
    })
    .join('\n');

  return `<div class="table-of-contents">
<h3>Spis treści</h3>
<ul>
${items}
</ul>
</div>`;
}

function insertTocAfterIntro(html: string, toc: string): string {
  // Insert after first </p> that comes after </h1>
  const h1End = html.indexOf('</h1>');
  if (h1End === -1) return toc + html;

  // Find the next </p> after h1 (end of intro paragraph) or after hero image
  const afterH1 = html.indexOf('</p>', h1End);
  if (afterH1 === -1) return html + toc;

  const insertPoint = afterH1 + '</p>'.length;
  return html.slice(0, insertPoint) + '\n' + toc + '\n' + html.slice(insertPoint);
}
