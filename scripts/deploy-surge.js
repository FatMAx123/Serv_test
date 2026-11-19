const { spawn } = require('child_process');
const path = require('path');

const SURGE_EMAIL = process.env.SURGE_EMAIL || '';
const SURGE_PASSWORD = process.env.SURGE_PASSWORD || '';
const SURGE_DOMAIN = process.env.SURGE_DOMAIN || 'ostrov-stali.surge.sh';

if (!SURGE_EMAIL || !SURGE_PASSWORD) {
  console.error('Missing required env vars: SURGE_EMAIL and SURGE_PASSWORD');
  process.exit(1);
}

const distPath = path.join(__dirname, '..', 'dist');
console.log('Deploying from:', distPath);

const child = spawn('cmd.exe', ['/c', 'npx', 'surge', distPath, SURGE_DOMAIN], {
  stdio: ['pipe', 'pipe', 'pipe']
});

child.stdout.on('data', (d) => {
  const s = d.toString();
  console.log('STDOUT:', s);
  if (s.toLowerCase().includes('email:')) {
    child.stdin.write(SURGE_EMAIL + '\n');
  } else if (s.toLowerCase().includes('password:')) {
    child.stdin.write(SURGE_PASSWORD + '\n');
  }
});

child.stderr.on('data', (d) => {
  console.log('STDERR:', d.toString());
});

child.on('close', (code) => {
  console.log('Exited with code:', code);
  if (code !== 0) process.exit(code || 1);
});
