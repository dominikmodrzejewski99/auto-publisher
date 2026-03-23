interface OpenRouterOptions {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

const RETRYABLE_STATUSES = [429, 500, 503];
const MAX_RETRIES = 1;
const INITIAL_DELAY_MS = 2000;

export async function callOpenRouter(options: OpenRouterOptions): Promise<string> {
  const {
    apiKey,
    systemPrompt,
    userPrompt,
    model = 'google/gemini-2.0-flash-exp:free',
    maxTokens = 4096,
    temperature = 0.7,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices[0].message.content;
    }

    if (RETRYABLE_STATUSES.includes(response.status) && attempt < MAX_RETRIES) {
      lastError = new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
      continue;
    }

    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
  }

  throw lastError ?? new Error('OpenRouter API error: unknown');
}
