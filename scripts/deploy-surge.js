const { spawn } = require('child_process');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist');
console.log('Deploying from:', distPath);

// Let's test running surge with spawn
const child = spawn('cmd.exe', ['/c', 'npx', 'surge', distPath, 'ostrov-stali.surge.sh'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

child.stdout.on('data', (d) => {
  const s = d.toString();
  console.log('STDOUT:', s);
  if (s.toLowerCase().includes('email:')) {
    console.log('Sending email...');
    child.stdin.write('aindiegus.dev@gmail.com\n');
  } else if (s.toLowerCase().includes('password:')) {
    console.log('Sending password...');
    child.stdin.write('OstrovStali2026!\n');
  }
});

child.stderr.on('data', (d) => {
  console.log('STDERR:', d.toString());
});

child.on('close', (code) => {
  console.log('Exited with code:', code);
});
