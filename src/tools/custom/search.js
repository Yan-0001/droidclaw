'use strict';
const registry = require('../registry');

registry.register('search', async (args) => {
 if (!args.query) return 'need query';
 
 const https = require('https');
 const query = encodeURIComponent(args.query);
 const url = `https://html.duckduckgo.com/html/?q=${query}&kp=0`;
 
 return new Promise((resolve) => {
 const req = https.get(url, {
 headers: { 
   'User-Agent': 'Mozilla/5.0 (Linux; Android 12)',
   'Accept': 'text/html'
 }
 }, (res) => {
 let body = '';
 res.on('data', chunk => body += chunk);
 res.on('end', () => {
 const matches = body.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>.*?<a class="result__snippet">(.*?)<\/a>/gs);
 const results = Array.from(matches).slice(0,5).map(m => {
 const title = m[2].replace(/<[^>]*>/g, '').trim();
 return `${title}\n${decodeURIComponent(m[1])}\n${m[3].replace(/<[^>]*>/g, '').trim()}\n---`;
 }).join('\n');
 
 resolve(results || 'no results');
 });
 });
 
 req.on('error', () => resolve('search failed'));
 req.setTimeout(5000, () => resolve('timeout'));
 req.end();
 });
});