import { google } from 'googleapis';
import { loadConfig } from '../config.js';

const postId = process.argv[2];
if (!postId) {
  console.error('Usage: tsx src/scripts/publish-post.ts <postId>');
  process.exit(1);
}

async function main() {
  const config = loadConfig();
  const auth = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret);
  auth.setCredentials({ refresh_token: config.googleRefreshToken });

  const blogger = google.blogger({ version: 'v3', auth });
  const res = await blogger.posts.publish({
    blogId: config.bloggerBlogId,
    postId,
  });

  console.log(`Published: ${res.data.url}`);
}

main();
