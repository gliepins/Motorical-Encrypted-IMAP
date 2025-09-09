import fs from 'fs';
import path from 'path';

export async function ensureMaildir(root, vaultboxId) {
  const base = path.join(root, String(vaultboxId), 'Maildir');
  for (const dir of ['cur', 'new', 'tmp']) {
    await fs.promises.mkdir(path.join(base, dir), { recursive: true });
  }
  return base;
}

export async function writeMessage(root, vaultboxId, data) {
  const base = await ensureMaildir(root, vaultboxId);
  const now = Date.now();
  const tmpName = path.join(base, 'tmp', `${now}.${process.pid}.encimap`);
  const newName = path.join(base, 'new', `${now}.${process.pid}.encimap:2,`);
  await fs.promises.writeFile(tmpName, data);
  await fs.promises.rename(tmpName, newName);
  return newName;
}
