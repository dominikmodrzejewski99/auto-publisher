import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishToBlogger } from '../publisher/blogger.js';

// Mock googleapis
vi.mock('googleapis', () => {
  function OAuth2() {
    // @ts-expect-error mock constructor
    this.setCredentials = vi.fn();
  }
  return {
    google: {
      auth: {
        OAuth2,
      },
      blogger: vi.fn().mockReturnValue({
        posts: {
          insert: vi.fn(),
        },
      }),
    },
  };
});

import { google } from 'googleapis';

describe('publishToBlogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should publish article and return URL', async () => {
    const mockInsert = vi.fn().mockResolvedValueOnce({
      data: {
        url: 'https://www.podrozedominikanskie.pl/2026/03/bali-10-dni.html',
        id: '12345',
      },
    });

    const mockBlogger = { posts: { insert: mockInsert } };
    vi.mocked(google.blogger).mockReturnValue(mockBlogger as any);

    const result = await publishToBlogger({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      blogId: 'blog-123',
      title: 'Bali w 10 dni',
      content: '<h1>Bali</h1><p>Content</p>',
      labels: ['Bali', 'plan podrozy'],
    });

    expect(result.url).toContain('podrozedominikanskie');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        blogId: 'blog-123',
        requestBody: expect.objectContaining({
          title: 'Bali w 10 dni',
        }),
      }),
    );
  });

  it('should throw on API error', async () => {
    const mockInsert = vi.fn().mockRejectedValueOnce(new Error('Auth failed'));
    const mockBlogger = { posts: { insert: mockInsert } };
    vi.mocked(google.blogger).mockReturnValue(mockBlogger as any);

    await expect(
      publishToBlogger({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        refreshToken: 'refresh-token',
        blogId: 'blog-123',
        title: 'Test',
        content: '<p>Test</p>',
        labels: [],
      }),
    ).rejects.toThrow();
  });
});
