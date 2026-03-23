import { google } from 'googleapis';

interface PublishOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  blogId: string;
  title: string;
  content: string;
  labels: string[];
}

interface PublishResult {
  url: string;
  postId: string;
}

export async function publishToBlogger(options: PublishOptions): Promise<PublishResult> {
  const { clientId, clientSecret, refreshToken, blogId, title, content, labels } = options;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const blogger = google.blogger({ version: 'v3', auth });

  const response = await blogger.posts.insert({
    blogId,
    requestBody: {
      title,
      content,
      labels,
    },
  });

  if (!response.data.url || !response.data.id) {
    throw new Error('Blogger API returned no URL or ID');
  }

  return {
    url: response.data.url,
    postId: response.data.id,
  };
}
