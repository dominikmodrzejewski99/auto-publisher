import { google } from 'googleapis';
import { readFile } from 'fs/promises';

interface IndexingOptions {
  serviceAccountKeyPath: string;
  url: string;
}

/**
 * Notify Google that a URL has been updated or published,
 * requesting immediate crawling via the Indexing API.
 */
export async function requestGoogleIndexing(options: IndexingOptions): Promise<void> {
  const { serviceAccountKeyPath, url } = options;

  const keyFile = JSON.parse(await readFile(serviceAccountKeyPath, 'utf-8'));

  const auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/indexing'],
  });

  const indexing = google.indexing({ version: 'v3', auth });

  const response = await indexing.urlNotifications.publish({
    requestBody: {
      url,
      type: 'URL_UPDATED',
    },
  });

  if (response.status !== 200) {
    throw new Error(`Google Indexing API error: ${response.status} ${response.statusText}`);
  }
}
