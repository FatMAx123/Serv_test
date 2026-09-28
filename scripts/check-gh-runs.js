// scripts/check-gh-runs.js
const https = require('https');
const fs = require('fs');
const path = require('path');

const tokenPath = path.join(__dirname, '..', '.gh_token');
const token = fs.readFileSync(tokenPath, 'utf8').trim();

const req = https.request({
  hostname: 'api.github.com',
  path: '/repos/FatMAx123/Serv_test/actions/runs?per_page=10',
  headers: {
    'User-Agent': 'Project-Steam-Agent',
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  }
}, res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (data.workflow_runs) {
        console.log('Total runs:', data.total_count);
        data.workflow_runs.forEach(r => {
          console.log(`- ID: ${r.id} | Name: "${r.name}" | Event: ${r.event} | Status: ${r.status} | Conclusion: ${r.conclusion} | Commit: ${r.head_commit ? r.head_commit.message.split('\n')[0] : ''} | URL: ${r.html_url}`);
        });
      } else {
        console.log('Response:', body);
      }
    } catch (e) {
      console.error(e, body);
    }
  });
});
req.on('error', err => console.error(err));
req.end();
