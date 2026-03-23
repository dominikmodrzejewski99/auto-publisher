import { createInterface } from 'readline';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;

  if (!appId || !appSecret) {
    console.error('Set FB_APP_ID and FB_APP_SECRET in .env first');
    process.exit(1);
  }

  console.log('FB Token Refresh Helper\n');
  console.log('Steps to get a new long-lived Page Access Token:\n');
  console.log('1. Go to https://developers.facebook.com/tools/explorer/');
  console.log('2. Select your App');
  console.log('3. Click "Get User Access Token"');
  console.log('4. Select permissions: pages_manage_posts, pages_read_engagement');
  console.log('5. Click "Generate Access Token" and authorize');
  console.log('6. Copy the short-lived token\n');

  const shortToken = await askInput('Paste the short-lived user token: ');

  // Exchange for long-lived user token
  console.log('\nExchanging for long-lived user token...');
  const llParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });

  const llResponse = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${llParams}`);
  const llData = await llResponse.json();

  if (llData.error) {
    console.error('Error:', llData.error.message);
    process.exit(1);
  }

  const longLivedUserToken = llData.access_token;
  console.log('✅ Got long-lived user token');

  // Get page access token
  console.log('\nFetching Page Access Token...');
  const pageResponse = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedUserToken}`,
  );
  const pageData = await pageResponse.json();

  if (pageData.error) {
    console.error('Error:', pageData.error.message);
    process.exit(1);
  }

  console.log('\nYour pages:');
  for (const page of pageData.data) {
    console.log(`  - ${page.name} (ID: ${page.id})`);
    console.log(`    Token: ${page.access_token.substring(0, 20)}...`);
  }

  if (pageData.data.length === 1) {
    const page = pageData.data[0];
    console.log(`\n✅ Update your .env and GitHub Secrets:`);
    console.log(`FB_PAGE_ID=${page.id}`);
    console.log(`FB_PAGE_ACCESS_TOKEN=${page.access_token}`);
  } else {
    console.log('\nCopy the token for your desired page and update .env + GitHub Secrets.');
  }
}

function askInput(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

main().catch(console.error);
