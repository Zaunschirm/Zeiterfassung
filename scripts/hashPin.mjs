import readline from 'node:readline';
import { randomBytes, scrypt as _scrypt } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(_scrypt);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q){ return new Promise(res => rl.question(q, res)); }

try {
  const pin = await ask('PIN: ');
  rl.close();
  if (!pin) throw new Error('No PIN provided');

  const salt = randomBytes(16);
  const key = await scrypt(pin, salt, 64);
  console.log('pin_salt (base64):', salt.toString('base64'));
  console.log('pin_hash (base64):', Buffer.from(key).toString('base64'));
} catch (e) {
  console.error('Error:', e);
  process.exit(1);
}
