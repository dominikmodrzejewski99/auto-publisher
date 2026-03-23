import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('should throw if required env vars are missing', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const { loadConfig } = await import('../config.js');
    expect(() => loadConfig()).toThrow();
  });

  it('should load config from env vars', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('UNSPLASH_ACCESS_KEY', 'unsplash-key');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'g-client');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'g-secret');
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'g-refresh');
    vi.stubEnv('BLOGGER_BLOG_ID', 'blog-123');
    vi.stubEnv('FB_PAGE_ACCESS_TOKEN', 'fb-token');
    vi.stubEnv('FB_PAGE_ID', 'fb-page-123');
    vi.stubEnv('FB_APP_ID', 'fb-app');
    vi.stubEnv('FB_APP_SECRET', 'fb-secret');

    const { loadConfig } = await import('../config.js');
    const config = loadConfig();
    expect(config.openRouterApiKey).toBe('test-key');
    expect(config.bloggerBlogId).toBe('blog-123');
  });

  it('should detect dry-run mode from args', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('UNSPLASH_ACCESS_KEY', 'unsplash-key');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'g-client');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'g-secret');
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'g-refresh');
    vi.stubEnv('BLOGGER_BLOG_ID', 'blog-123');
    vi.stubEnv('FB_PAGE_ACCESS_TOKEN', 'fb-token');
    vi.stubEnv('FB_PAGE_ID', 'fb-page-123');
    vi.stubEnv('FB_APP_ID', 'fb-app');
    vi.stubEnv('FB_APP_SECRET', 'fb-secret');

    const originalArgv = process.argv;
    process.argv = [...originalArgv, '--dry-run'];
    const { loadConfig } = await import('../config.js');
    const config = loadConfig();
    expect(config.dryRun).toBe(true);
    process.argv = originalArgv;
  });
});
