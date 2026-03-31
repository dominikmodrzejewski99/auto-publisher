import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { callGemini } from '../ai/gemini.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface PinterestTokenCheckResult {
  valid: boolean;
  message: string;
}

export async function checkPinterestToken(accessToken: string): Promise<PinterestTokenCheckResult> {
  try {
    const response = await fetch('https://api.pinterest.com/v5/user_account', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { valid: false, message: `Pinterest token invalid: ${response.status}` };
    }

    const data = await response.json();
    return { valid: true, message: `Pinterest connected as: ${data.username}` };
  } catch (error) {
    return { valid: false, message: `Pinterest token check failed: ${error}` };
  }
}

interface GeneratePinDescriptionOptions {
  apiKey: string;
  articleTitle: string;
  articleDescription: string;
  keywords: string[];
}

export async function generatePinDescription(options: GeneratePinDescriptionOptions): Promise<string> {
  const { apiKey, articleTitle, articleDescription, keywords } = options;

  const systemPrompt = await readFile(
    join(__dirname, '../../prompts/pinterest-pin-system.md'),
    'utf-8',
  );

  const userPrompt = [
    `Tytuł artykułu: "${articleTitle}"`,
    `Opis: ${articleDescription}`,
    `Słowa kluczowe: ${keywords.join(', ')}`,
  ].join('\n');

  return callGemini({
    apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 512,
    temperature: 0.8,
  });
}

interface CreatePinOptions {
  accessToken: string;
  boardId: string;
  title: string;
  description: string;
  link: string;
  imageUrl: string;
}

interface CreatePinResult {
  pinId: string;
}

export async function createPin(options: CreatePinOptions): Promise<CreatePinResult> {
  const { accessToken, boardId, title, description, link, imageUrl } = options;

  const response = await fetch('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      board_id: boardId,
      title: title.slice(0, 100),
      description: description.slice(0, 500),
      link,
      media_source: {
        source_type: 'image_url',
        url: imageUrl,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Pinterest API error: ${response.status} ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  return { pinId: data.id };
}
