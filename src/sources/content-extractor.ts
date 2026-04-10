const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Fetch a URL and extract the main article text.
 * Uses heuristics to find the article body: <article>, [role=main], .post-content, etc.
 * Falls back to <body> with noise stripped.
 */
export async function extractArticleContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return '';

    const html = await response.text();
    return extractMainContent(html);
  } catch {
    clearTimeout(timeout);
    return '';
  }
}

function extractMainContent(html: string): string {
  // Remove noise: scripts, styles, nav, footer, sidebar, ads
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try to find article body using common selectors
  const articlePatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*class="[^"]*(?:post-content|article-content|entry-content|article-body|post-body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*role="main"[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];

  for (const pattern of articlePatterns) {
    const match = pattern.exec(cleaned);
    if (match) {
      const text = stripHtml(match[1]);
      if (text.length > 200) return text.slice(0, 5000);
    }
  }

  // Fallback: extract all <p> tags
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(cleaned)) !== null) {
    const text = stripHtml(match[1]).trim();
    if (text.length > 30) paragraphs.push(text);
  }

  if (paragraphs.length > 0) {
    return paragraphs.join('\n\n').slice(0, 5000);
  }

  // Last resort: strip everything
  return stripHtml(cleaned).slice(0, 3000);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
