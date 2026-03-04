'use strict';
const registry = require('../registry');
const { exec } = require('child_process');

registry.register('web_search_lite', async (args) => {
 if (!args.query) return 'need query';
 
 const query = args.query.replace(/ /g, '+');
 const cmd = `curl -A "Mozilla/5.0" "https://lite.duckduckgo.com/lite/?q=${query}" 2>/dev/null | grep -o 'result-link">[^<]*' | sed 's/result-link">//'`;
 
 return new Promise(resolve => {
  exec(cmd, { maxBuffer: 64 * 1024 }, (err, stdout) => {
   if (err) {
    resolve('search failed');
    return;
   }
   const urls = stdout.split('\n').filter(l => l.trim()).slice(0, 5);
   resolve(urls.length ? urls.join('\n') : 'no results');
  });
 });
});