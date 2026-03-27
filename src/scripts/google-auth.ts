import { google } from 'googleapis';
import http from 'http';
import open from 'open';
import dotenv from 'dotenv';

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/blogger'];
const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}`;

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first');
    process.exit(1);
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${PORT}`);
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Autoryzacja odrzucona</h1><p>Możesz zamknąć tę kartę.</p>');
        server.close();
        reject(new Error(`Authorization denied: ${error}`));
        return;
      }

      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Autoryzacja udana!</h1><p>Wróć do terminala. Możesz zamknąć tę kartę.</p>');
        server.close();
        resolve(authCode);
      }
    });

    server.listen(PORT, () => {
      console.log(`\nOtwieranie przeglądarki do autoryzacji...\n`);
      console.log(`Jeśli przeglądarka się nie otworzyła, otwórz ręcznie:\n${authUrl}\n`);
      open(authUrl).catch(() => {});
    });
  });

  const { tokens } = await oauth2.getToken(code);
  console.log('\n✅ Success! Add this to your .env file:\n');
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
}

main().catch(console.error);