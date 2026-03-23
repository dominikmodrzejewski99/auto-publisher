import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callOpenRouter } from '../ai/openrouter.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('callOpenRouter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should call OpenRouter API and return content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello world' } }],
      }),
    });

    const result = await callOpenRouter({
      apiKey: 'test-key',
      systemPrompt: 'You are helpful',
      userPrompt: 'Say hello',
    });

    expect(result).toBe('Hello world');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    );
  });

  it('should retry on 429 with backoff', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Retried OK' } }],
        }),
      });

    const result = await callOpenRouter({
      apiKey: 'test-key',
      systemPrompt: 'You are helpful',
      userPrompt: 'Say hello',
    });

    expect(result).toBe('Retried OK');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });

    await expect(
      callOpenRouter({
        apiKey: 'test-key',
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
      }),
    ).rejects.toThrow('OpenRouter API error');
  });
});
