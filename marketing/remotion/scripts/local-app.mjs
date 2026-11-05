import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const app = fileURLToPath(new URL('../../../v2/', import.meta.url));
const require = createRequire(`${app}/package.json`);
const config = require('dotenv').parse(readFileSync(`${app}/.env.local`));
const database = new URL(config.DATABASE_URL);
if (!['localhost','127.0.0.1','[::1]'].includes(database.hostname) || !database.pathname.endsWith('_test')) throw Error('Demo capture requires a loopback test database.');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3217'], {
  cwd: app, stdio: 'inherit', windowsHide: true,
  env: {...process.env, ...config, APP_ENV:'test', APP_URL:'http://127.0.0.1:3217', ALLOWED_HOSTS:'127.0.0.1,localhost', COOKIE_SECURE:'false', EMAIL_ENABLED:'false', APP_READ_ONLY:'false', PAYOS_CLIENT_ID:'',PAYOS_API_KEY:'',PAYOS_CHECKSUM_KEY:''},
});
process.on('SIGINT',()=>child.kill());
process.on('SIGTERM',()=>child.kill());
child.on('exit',code=>process.exit(code ?? 0));
