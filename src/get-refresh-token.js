import { OAuth2Client } from 'google-auth-library/build/src/auth/oauth2client.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as http from 'http';
import open from 'open/index.js';

const SCOPES = [
  'https://www.googleapis.com/auth/homegraph'
];

async function getRefreshToken() {
  // Read config
  const configPath = join(process.cwd(), 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  
  const oAuth2Client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: 'http://localhost:3000/oauth2callback'
  });

  // Create server to handle OAuth callback
  const server = http.createServer();
  
  // Wait for server to be ready
  await new Promise((resolve) => server.listen(3000, () => resolve()));
  const port = server.address().port;

  // Generate auth url
  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  // Open browser for auth
  console.log('Opening browser for authentication...');
  await open(authorizeUrl);

  // Wait for OAuth callback
  const code = await new Promise((resolve, reject) => {
    server.on('request', async (req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:${port}`);
        if (url.pathname === '/oauth2callback') {
          const code = url.searchParams.get('code');
          if (!code) {
            throw new Error('No code received');
          }
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authentication successful!</h1><p>You can close this window.</p>');
          
          resolve(code);
        }
      } catch (error) {
        reject(error);
      }
    });
  });

  // Exchange code for tokens
  const { tokens } = await oAuth2Client.getToken(code);
  
  // Update config with refresh token
  if (!tokens.refresh_token) {
    throw new Error('No refresh token received');
  }
  
  config.refreshToken = tokens.refresh_token;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log('Refresh token has been saved to config.json');
  
  // Cleanup
  server.close();
  process.exit(0);
}

getRefreshToken().catch(console.error);
