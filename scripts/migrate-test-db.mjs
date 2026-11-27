import { spawnSync } from 'node:child_process';

const testUrl = process.env.TEDX_TEST_DATABASE_URL;
if (!testUrl) throw new Error('Define TEDX_TEST_DATABASE_URL para usar la base de pruebas aislada.');
const parsed = new URL(testUrl);
const database = parsed.pathname.replace(/^\//, '');
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || database !== 'tedxumsa_phase3_test') {
  throw new Error('Por seguridad, las pruebas solo admiten localhost y la base tedxumsa_phase3_test.');
}
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['exec', '--', 'prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl, DATABASE_MIGRATION_URL: testUrl },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
