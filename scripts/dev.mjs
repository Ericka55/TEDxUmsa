import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = ['@tedxumsa/api', '@tedxumsa/web'].map((workspace) =>
  spawn(npm, ['run', 'dev', `--workspace=${workspace}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
);

let stopping = false;
function stopOthers(except) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child !== except && child.exitCode === null) child.kill();
  }
}

for (const child of children) {
  child.on('exit', () => stopOthers(child));
  child.on('error', (error) => {
    console.error('No se pudo iniciar un proceso de desarrollo:', error.message);
    stopOthers(child);
    process.exitCode = 1;
  });
}

process.on('SIGINT', () => {
  stopOthers();
  process.exit();
});
