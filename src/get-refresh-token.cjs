const { OAuth2Client } = require('google-auth-library');
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const express = require('express');

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

  const app = express();
  let server;

  // Get auth code via OAuth
  const code = await new Promise((resolve, reject) => {
    app.get('/', (req, res) => {
      res.send('<h1>OAuth2 Server</h1><p>Waiting for authentication callback...</p>');
    });

    app.get('/oauth2callback', (req, res) => {
      const code = req.query.code;
      if (code) {
        res.send('<h1>Authentication successful!</h1><p>You can close this window.</p>');
        resolve(code);
      } else {
        res.status(400).send('No code received');
        reject(new Error('No code received'));
      }
    });

    server = app.listen(3000, async () => {
      console.log('OAuth server is running on http://localhost:3000');
      
      const authorizeUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        include_granted_scopes: true
      });

      console.log('Opening browser for authentication...');
      const open = (await import('open')).default;
      await open(authorizeUrl);
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
