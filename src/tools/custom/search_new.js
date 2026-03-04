'use strict';
const registry = require('../registry');

registry.register('search_new', async (args) => {
 if (!args.query) return 'need query';
 
 const https = require('https');
 const query = encodeURIComponent(args.query);
 
 return new Promise((resolve) => {
 const req = https.get(`https://api.search.brave.com/search?q=${query}&count=5&format=json`, {
 headers: {
 'User-Agent': 'Mozilla/5.0 (Android 12; SM-A135F)',
 'Accept': 'application/json'
 }
 }, (res) => {
 let body = '';
 res.on('data', chunk => body += chunk);
 res.on('end', () => {
 try {
 const data = JSON.parse(body);
 if (!data.web?.results?.length) return resolve('no results');
 
 const results = data.web.results.slice(0, 5).map(r => 
 `${r.title}\n${r.url}\n${r.description || ''}\n---`
 ).join('\n');
 
 resolve(results);
 } catch {
 resolve('search failed');
 }
 });
 });
 
 req.on('error', () => resolve('network error'));
 req.end();
 });
});