import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('vendor/', root), { recursive: true });
const source = await readFile(new URL('node_modules/tldts/dist/index.esm.min.js', root), 'utf8');
await writeFile(new URL('vendor/tldts.js', root), source.replace(/\/\/# sourceMappingURL=.*$/m, '').trimEnd() + '\n');
await copyFile(new URL('node_modules/tldts/LICENSE', root), new URL('vendor/tldts.LICENSE', root));
console.log('Bundled tldts and its Public Suffix List for offline use.');
