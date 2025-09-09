import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

export async function encryptCMS({ recipientsPEM = [], rawRfc822 }) {
  if (!Array.isArray(recipientsPEM) || recipientsPEM.length === 0) {
    throw new Error('No recipients');
  }
  const tmpBase = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'encimap-'));
  try {
    const certPaths = [];
    for (let i = 0; i < recipientsPEM.length; i++) {
      const p = path.join(tmpBase, `r${i}.pem`);
      await fs.promises.writeFile(p, recipientsPEM[i]);
      certPaths.push(p);
    }
    const args = ['smime', '-encrypt', '-aes256', '-outform', 'PEM', ...certPaths];
    const proc = spawn('openssl', args);
    const out = [];
    const err = [];
    proc.stdout.on('data', (d) => out.push(d));
    proc.stderr.on('data', (d) => err.push(d));
    const p = new Promise((resolve, reject) => {
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`openssl smime failed: ${Buffer.concat(err).toString()}`));
        }
        resolve(Buffer.concat(out));
      });
    });
    proc.stdin.write(Buffer.isBuffer(rawRfc822) ? rawRfc822 : Buffer.from(String(rawRfc822)));
    proc.stdin.end();
    const cipher = await p;
    return cipher;
  } finally {
    try { await fs.promises.rm(tmpBase, { recursive: true, force: true }); } catch {}
  }
}
