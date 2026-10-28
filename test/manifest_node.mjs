// Writes the build's entry of release/manifest.json from the tested files: the player's game (its package or the folder
// it was extracted into), Title Update #2 (its package or default.xexp) and the NRO in release/. From
// feedingfrenzy-nx-installer's, with the title update.
// Usage: node test/manifest_node.mjs <game package or folder> <title update package or default.xexp> <version> [--write]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chosenOnDisk, root } from './node_files.mjs';
import { findGames, identifyGames } from '../lib/installer.js';

const args = process.argv.slice(2);
const write = args.includes('--write');
const [input, updateInput, version] = args.filter((a) => a !== '--write');
const sha = (b) => createHash('sha256').update(b).digest('hex');

const chosen = await findGames(chosenOnDisk([input, updateInput]));
if (!chosen.game || !chosen.update) {
  throw new Error(`no Zuma game in ${input} or no title update in ${updateInput}`);
}
const { xexHash } = await identifyGames(chosen, { builds: [] });
const xexpFile = chosen.update.files[0];
const xexpSha256 = sha(Buffer.from(await xexpFile.read(0, xexpFile.size)));
const nro = fs.readFileSync(path.join(root, 'release', 'zuma.nro'));
const build = {
  edition: 'Xbox Live Arcade (title 584107EF)',
  version,
  xex_sha256: xexHash,
  xexp_sha256: xexpSha256,
  game_files: chosen.game.files.map((f) => ({ path: f.path, size: f.size })).sort((a, b) => (a.path < b.path ? -1 : 1)),
  nro: 'zuma.nro',
  nro_sha256: sha(nro),
  nro_size: nro.length,
};
const manifest = { version: 1, builds: [build] };
const text = `${JSON.stringify(manifest, null, 2)}\n`;
if (write) {
  fs.writeFileSync(path.join(root, 'release', 'manifest.json'), text);
  console.log(`wrote release/manifest.json (${build.game_files.length} game files, NRO ${build.nro_sha256})`);
} else {
  process.stdout.write(text);
}
