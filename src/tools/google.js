'use strict';
const registry = require('./registry');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const https    = require('https');

const CONFIG_DIR   = path.join(os.homedir(), '.config');
const CREDS_FILE   = path.join(CONFIG_DIR, 'kira-google-credentials.json');
const TOKEN_FILE   = path.join(CONFIG_DIR, 'kira-google-token.json');

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// ─── Token management ─────────────────────────────────────────────────────────

function loadCreds() {
  if (!fs.existsSync(CREDS_FILE)) return null;
  const raw = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
  return raw.installed || raw.web || null;
}

function loadToken() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
}

function saveToken(token) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

async function refreshAccessToken(creds, token) {
  const params = new URLSearchParams({
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: token.refresh_token,
    grant_type:    'refresh_token',
  });

  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    path:     '/token',
    method:   'POST',
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, params.toString());

  if (res.body.access_token) {
    token.access_token = res.body.access_token;
    token.expiry_date  = Date.now() + (res.body.expires_in * 1000);
    saveToken(token);
    return token;
  }
  throw new Error('refresh failed: ' + JSON.stringify(res.body));
}

async function getValidToken() {
  const creds = loadCreds();
  if (!creds) throw new Error('no credentials file. save to ~/.config/kira-google-credentials.json');

  let token = loadToken();
  if (!token) throw new Error('not authenticated. use google_auth to authenticate first.');

  if (token.expiry_date && Date.now() > token.expiry_date - 60000) {
    token = await refreshAccessToken(creds, token);
  }
  return token;
}

async function apiRequest(method, hostname, path, token, body) {
  const options = {
    hostname,
    path,
    method,
    headers: {
      'Authorization': 'Bearer ' + token.access_token,
      'Content-Type':  'application/json',
    },
  };
  return httpsRequest(options, body ? JSON.stringify(body) : undefined);
}

// ─── Auth tool ───────────────────────────────────────────────────────────────

registry.register('google_auth', async function(args) {
  const code = args.code;
  const creds = loadCreds();
  if (!creds) return 'error: credentials file missing at ~/.config/kira-google-credentials.json';

  if (!code) {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/calendar',
    ].join(' ');

    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id:     creds.client_id,
      redirect_uri:  'http://localhost',
      response_type: 'code',
      scope:         scopes,
      access_type:   'offline',
      prompt:        'consent',
    }).toString();

    return 'open this URL in a browser to authenticate:\n\n' + url + '\n\nthen call google_auth with the code you get: google_auth {"code": "YOUR_CODE"}';
  }

  const params = new URLSearchParams({
    code,
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
    redirect_uri:  'http://localhost',
    grant_type:    'authorization_code',
  });

  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    path:     '/token',
    method:   'POST',
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, params.toString());

  if (res.body.access_token) {
    res.body.expiry_date = Date.now() + (res.body.expires_in * 1000);
    saveToken(res.body);
    return 'authenticated. token saved to ~/.config/kira-google-token.json. google tools are now live.';
  }
  return 'auth failed: ' + JSON.stringify(res.body);
}, 'authenticate kira with her google account. call with no args to get the auth URL, then call again with the code.');

// ─── Gmail tools ─────────────────────────────────────────────────────────────

registry.register('gmail_list', async function(args) {
  const token  = await getValidToken();
  const limit  = args.limit || 10;
  const query  = args.query || '';
  const res    = await apiRequest('GET', 'gmail.googleapis.com',
    '/gmail/v1/users/me/messages?maxResults=' + limit + (query ? '&q=' + encodeURIComponent(query) : ''),
    token);

  if (!res.body.messages) return 'no messages found.';

  const details = await Promise.all(res.body.messages.slice(0, 5).map(async (m) => {
    const msg = await apiRequest('GET', 'gmail.googleapis.com',
      '/gmail/v1/users/me/messages/' + m.id + '?format=metadata&metadataHeaders=Subject&metadataHeaders=From',
      token);
    const headers = msg.body.payload && msg.body.payload.headers || [];
    const subject = (headers.find(h => h.name === 'Subject') || {}).value || '(no subject)';
    const from    = (headers.find(h => h.name === 'From') || {}).value || 'unknown';
    return 'from: ' + from + '\nsubject: ' + subject;
  }));

  return details.join('\n---\n');
}, 'list recent emails in kira\'s gmail inbox');

registry.register('gmail_send', async function(args) {
  if (!args.to || !args.subject || !args.body) return 'error: to, subject, and body required';
  const token = await getValidToken();

  const email = [
    'To: ' + args.to,
    'Subject: ' + args.subject,
    'Content-Type: text/plain; charset=utf-8',
    '',
    args.body,
  ].join('\n');

  const encoded = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await apiRequest('POST', 'gmail.googleapis.com', '/gmail/v1/users/me/messages/send', token, { raw: encoded });

  if (res.body.id) return 'email sent. message id: ' + res.body.id;
  return 'send failed: ' + JSON.stringify(res.body);
}, 'send an email from kira\'s gmail account');

// ─── Drive tools ─────────────────────────────────────────────────────────────

registry.register('drive_save', async function(args) {
  if (!args.filename || !args.content) return 'error: filename and content required';
  const token = await getValidToken();

  const metadata = { name: args.filename, mimeType: 'text/plain' };
  const boundary = 'kira_boundary';
  const body = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    '--' + boundary,
    'Content-Type: text/plain',
    '',
    args.content,
    '--' + boundary + '--',
  ].join('\r\n');

  const res = await httpsRequest({
    hostname: 'www.googleapis.com',
    path:     '/upload/drive/v3/files?uploadType=multipart',
    method:   'POST',
    headers:  {
      'Authorization': 'Bearer ' + token.access_token,
      'Content-Type':  'multipart/related; boundary=' + boundary,
    },
  }, body);

  if (res.body.id) return 'saved to drive: ' + args.filename + ' (id: ' + res.body.id + ')';
  return 'save failed: ' + JSON.stringify(res.body);
}, 'save a file to kira\'s google drive');

registry.register('drive_list', async function(args) {
  const token = await getValidToken();
  const limit = args.limit || 10;
  const res   = await apiRequest('GET', 'www.googleapis.com',
    '/drive/v3/files?pageSize=' + limit + '&fields=files(id,name,modifiedTime)',
    token);

  if (!res.body.files || !res.body.files.length) return 'drive is empty.';
  return res.body.files.map(f => f.name + ' (modified: ' + new Date(f.modifiedTime).toLocaleDateString() + ')').join('\n');
}, 'list files in kira\'s google drive');

// ─── Calendar tools ──────────────────────────────────────────────────────────

registry.register('calendar_list', async function(args) {
  const token  = await getValidToken();
  const limit  = args.limit || 10;
  const now    = new Date().toISOString();
  const res    = await apiRequest('GET', 'www.googleapis.com',
    '/calendar/v3/calendars/primary/events?maxResults=' + limit + '&timeMin=' + encodeURIComponent(now) + '&singleEvents=true&orderBy=startTime',
    token);

  if (!res.body.items || !res.body.items.length) return 'no upcoming events.';
  return res.body.items.map(e => {
    const start = e.start.dateTime || e.start.date;
    return new Date(start).toLocaleString() + ' — ' + e.summary;
  }).join('\n');
}, 'list upcoming calendar events from kira\'s google calendar');

registry.register('calendar_add', async function(args) {
  if (!args.title || !args.date) return 'error: title and date required';
  const token = await getValidToken();

  const event = {
    summary: args.title,
    start:   { dateTime: new Date(args.date).toISOString(), timeZone: 'Asia/Kolkata' },
    end:     { dateTime: new Date(new Date(args.date).getTime() + 3600000).toISOString(), timeZone: 'Asia/Kolkata' },
  };
  if (args.description) event.description = args.description;

  const res = await apiRequest('POST', 'www.googleapis.com', '/calendar/v3/calendars/primary/events', token, event);
  if (res.body.id) return 'event added: ' + args.title + ' on ' + new Date(args.date).toLocaleString();
  return 'failed: ' + JSON.stringify(res.body);
}, 'add an event to kira\'s google calendar');

module.exports = {};
