import dotenv from 'dotenv';
import { requestGoogleIndexing } from '../publisher/google-indexing.js';

dotenv.config();

const url = process.argv[2];
if (!url) {
  console.error('Usage: tsx src/scripts/test-indexing.ts <article-url>');
  console.error('Example: tsx src/scripts/test-indexing.ts https://www.podrozedominikanskie.pl/2026/03/example.html');
  process.exit(1);
}

const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
if (!keyPath) {
  console.error('Missing GOOGLE_SERVICE_ACCOUNT_KEY_PATH in .env');
  process.exit(1);
}

console.log(`Requesting indexing for: ${url}`);

try {
  await requestGoogleIndexing({ serviceAccountKeyPath: keyPath, url });
  console.log('Google indexing requested successfully!');
} catch (err) {
  console.error('Failed:', err instanceof Error ? err.message : err);
}
