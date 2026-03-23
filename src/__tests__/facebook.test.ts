import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkFbTokenExpiry, publishToFacebook, generateFbPost } from '../social/facebook.js';
import * as openrouter from '../ai/openrouter.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.mock('../ai/openrouter.js');
const mockCallOpenRouter = vi.mocked(openrouter.callOpenRouter);

describe('checkFbTokenExpiry', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return valid when token has >7 days', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { expires_at: expiresAt, is_valid: true } }),
    });

    const result = await checkFbTokenExpiry({
      pageAccessToken: 'token',
      appId: 'app-id',
      appSecret: 'app-secret',
    });

    expect(result.valid).toBe(true);
    expect(result.warning).toBe(false);
  });

  it('should return warning when token expires in <7 days', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 3; // 3 days
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { expires_at: expiresAt, is_valid: true } }),
    });

    const result = await checkFbTokenExpiry({
      pageAccessToken: 'token',
      appId: 'app-id',
      appSecret: 'app-secret',
    });

    expect(result.valid).toBe(true);
    expect(result.warning).toBe(true);
  });

  it('should return invalid for expired token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { expires_at: 0, is_valid: false } }),
    });

    const result = await checkFbTokenExpiry({
      pageAccessToken: 'token',
      appId: 'app-id',
      appSecret: 'app-secret',
    });

    expect(result.valid).toBe(false);
  });
});

describe('generateFbPost', () => {
  it('should generate post text via AI', async () => {
    mockCallOpenRouter.mockResolvedValueOnce(
      'Marzysz o Bali? 🌴 Przygotowaliśmy gotowy plan na 10 dni! 👉 A Ty, wolisz góry czy plaże? 🤔',
    );

    const text = await generateFbPost({
      apiKey: 'key',
      articleTitle: 'Bali w 10 dni',
      articleDescription: 'Plan podróży na Bali',
      articleUrl: 'https://example.com/bali',
    });

    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(350); // 300 + some tolerance
  });
});

describe('publishToFacebook', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should schedule a post', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'post-123' }),
    });

    const result = await publishToFacebook({
      pageId: 'page-id',
      pageAccessToken: 'token',
      message: 'Test post 🌴',
      link: 'https://example.com',
      scheduledTime: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(result.postId).toBe('post-123');
  });
});
