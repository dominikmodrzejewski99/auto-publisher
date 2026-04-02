interface GeminiOptions {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  useGoogleSearch?: boolean;
}

const RETRYABLE_STATUSES = [429, 500, 503];
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 5000;

export async function callGemini(options: GeminiOptions): Promise<string> {
  const {
    apiKey,
    systemPrompt,
    userPrompt,
    model = 'gemini-3.1-flash-lite-preview',
    maxTokens = 4096,
    temperature = 0.7,
    jsonMode = false,
    useGoogleSearch = false,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
        ...(useGoogleSearch ? { tools: [{ google_search: {} }] } : {}),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error(`Gemini returned empty response: ${JSON.stringify(data)}`);
      }
      return text;
    }

    if (RETRYABLE_STATUSES.includes(response.status) && attempt < MAX_RETRIES) {
      lastError = new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      continue;
    }

    const errorBody = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  throw lastError ?? new Error('Gemini API error: unknown');
}
