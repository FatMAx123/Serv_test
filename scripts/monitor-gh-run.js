// scripts/monitor-gh-run.js
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const runId = process.argv[2] || '36396143305';
const tokenPath = path.join(__dirname, '..', '.gh_token');
const token = fs.readFileSync(tokenPath, 'utf8').trim();

function getRunInfo() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/FatMAx123/Serv_test/actions/runs/${runId}`,
      headers: {
        'User-Agent': 'Project-Steam-Agent',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getRunJobs() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/FatMAx123/Serv_test/actions/runs/${runId}/jobs`,
      headers: {
        'User-Agent': 'Project-Steam-Agent',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function getServerMetrics() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '93.77.168.135',
      port: 80,
      path: '/metrics',
      timeout: 3000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function main() {
  const [run, jobsData, metrics] = await Promise.all([
    getRunInfo(),
    getRunJobs(),
    getServerMetrics()
  ]);

  console.log(`=== RUN #${run.id} | Status: ${run.status} | Conclusion: ${run.conclusion || 'RUNNING'} ===`);
  if (jobsData && jobsData.jobs) {
    jobsData.jobs.forEach(j => {
      console.log(`- Job "${j.name}": status=${j.status}, conclusion=${j.conclusion || 'running'}`);
    });
  }

  if (metrics) {
    console.log(`📊 VPS METRICS: online=${metrics.online || metrics.players}, tickMs=${metrics.tickMs} (max: ${metrics.tickMsMax}), lagMs=${metrics.lagMs}, evLoopLag=${metrics.eventLoopLagMs}ms`);
  } else {
    console.log('📊 VPS METRICS: unavailable (timeout)');
  }
}

main().catch(console.error);
