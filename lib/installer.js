// Builds the zuma-nx.zip package from the player's own copy of Zuma (Xbox Live Arcade, title 584107EF): the game (its
// content package, read in place, or a folder it was extracted into) and Title Update #2 (its package, or its
// default.xexp). The update is needed: the port's code is the updated executable (the console applies default.xexp to
// default.xex when it starts, as the Xbox does). The game has no add-on.
//
// The zip holds the Switch build (zuma.nro) and its licenses, and the game's files with the update's default.xexp as
// the asset pack the console mounts (game_root.nxpack + .nxidx). The game compiles all of its 7 shaders while it runs,
// so none can be made from its files: the NRO carries them. The settings file, zuma.toml, is written by the game at its
// first start, so an update never replaces the player's settings.
//
// From feedingfrenzy-nx-installer (2026-10-28), itself from bejeweled3-nx-installer, with the title update found as
// peggle1-nx-installer finds Peggle's.

import { StfsPackage, readStfsHeader } from './from_sa2/stfs_package.js';
import { Fnv64, packChunks, packIndex, planPack } from './nxpack.js';
import { ZipWriter, zipSize } from './zip.js';
import { t } from './i18n.js';

const CHUNK = 16 * 1024 * 1024;
const ROOT = 'zuma-nx';
const NRO = 'zuma.nro';
const TITLE_ID = 0x584107ef;
const CONTENT_GAME = 0x000d0000;
const CONTENT_UPDATE = 0x000b0000;
// The title update's one file (an extracted update: default.xexp on its own, or beside the game's default.xex).
const UPDATE_FILE = 'default.xexp';
// An extracted game: default.xex with this file beside it (lower case).
const MARKER = 'resources/resources.xpr';
// files whose header is read to find the packages among the chosen files
const MAX_CANDIDATES = 256;
const JUNK = /(^|\/)(thumbs\.db|desktop\.ini|\.ds_store)$/i;

export async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function* chunksOf(file) {
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    yield await file.read(offset, Math.min(CHUNK, file.size - offset));
  }
}

function baseName(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function folderOf(path) {
  return path.slice(0, path.lastIndexOf('/') + 1);
}

// Where a release file is downloaded from. Its SHA-256 is part of the address, so every version is a different
// address and a copy kept by the browser is never mistaken for a newer one.
export function releasePath(name, hash) {
  return `./release/${name}?sha256=${hash}`;
}

export function programPath(build) {
  return releasePath(build.nro, build.nro_sha256);
}

// Sorts out what the player chose (files [{ path, size, read }] from the "Files" button or every file under the
// "Folder"). Returns { game, update, others }:
//   game = { kind: 'package' | 'folder', name, files } (the game's files, paths relative to the game) or null;
//   update = { kind: 'package' | 'folder', name, files } (default.xexp) or null;
//   others = names of packages of other games.
export async function findGames(chosen) {
  let game = null;
  let update = null;
  const others = [];
  // An extracted game: the shallowest default.xex with the marker file beside it; every file under its folder but the
  // title update's (taken from the update).
  const paths = new Set(chosen.map((f) => f.path.toLowerCase()));
  const folders = [...new Set(chosen.filter((f) => baseName(f.path).toLowerCase() === 'default.xex').map((f) => folderOf(f.path)))]
    .sort((a, b) => a.split('/').length - b.split('/').length);
  for (const folder of folders) {
    if (paths.has(`${folder}${MARKER}`.toLowerCase())) {
      const files = chosen.filter((f) => f.path.startsWith(folder))
        .map((f) => ({ ...f, path: f.path.slice(folder.length) }))
        .filter((f) => !JUNK.test(f.path) && f.path.toLowerCase() !== UPDATE_FILE);
      game = { kind: 'folder', name: folder ? baseName(folder.slice(0, -1)) : '', files };
      break;
    }
  }
  // An extracted title update: the shallowest default.xexp (the game folder's, when it has one). A package found below
  // takes its place.
  const xexps = chosen.filter((f) => baseName(f.path).toLowerCase() === UPDATE_FILE)
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
  if (xexps.length) {
    const folder = folderOf(xexps[0].path);
    update = { kind: 'folder', name: folder ? baseName(folder.slice(0, -1)) : '', files: [{ ...xexps[0], path: UPDATE_FILE }] };
  }
  // Packages, by their header (Xbox 360 content packages have no extension, but a title update's file name has a dot:
  // TU_1C421VF_0000104000000.00000000000O1; the game's own file types are left out).
  const inside = (f) => game && game.kind === 'folder' && game.files.some((h) => h.read === f.read);
  const candidates = chosen.filter((f) => f.size >= 0xa000 && !inside(f)
    && !/\.(xpr|xwb|xsb|xgs|png|jpg|jpeg|xml|info|wmv|xex|xexp|bin|zip|nro|toml|txt|db|ini)$/i.test(f.path)).slice(0, MAX_CANDIDATES);
  for (const file of candidates) {
    const header = readStfsHeader(await file.read(0, 0x600));
    if (!header) {
      continue;
    }
    const name = baseName(file.path);
    if (header.titleId !== TITLE_ID) {
      others.push(header.displayName || name);
    } else if (header.contentType === CONTENT_GAME && !game) {
      const pkg = await StfsPackage.open(file);
      game = { kind: 'package', name, files: pkg.files().filter((f) => f.path.toLowerCase() !== UPDATE_FILE) };
    } else if (header.contentType === CONTENT_UPDATE && (!update || update.kind === 'folder')) {
      const pkg = await StfsPackage.open(file);
      const xexp = pkg.files().find((f) => f.path.toLowerCase() === UPDATE_FILE);
      if (xexp) {
        update = { kind: 'package', name: header.displayName || name, files: [{ ...xexp, path: UPDATE_FILE }] };
      }
    }
  }
  return { game, update, others };
}

function fileNamed(files, name) {
  return files.find((f) => f.path.toLowerCase() === name);
}

// Identifies the build: default.xex and the title update's default.xexp by their SHA-256, the game's other files by
// their sizes. Returns { xexHash, xexpHash, build, problems }.
export async function identifyGames(chosen, manifest) {
  const { game, update } = chosen;
  if (!game) {
    const error = new Error(t('noGame'));
    error.code = 'noGame';
    throw error;
  }
  const xexFile = fileNamed(game.files, 'default.xex');
  const xexHash = await sha256(await xexFile.read(0, xexFile.size));
  const build = manifest.builds.find((b) => b.xex_sha256 === xexHash) || null;
  const problems = [];
  let xexpHash = null;
  if (build) {
    if (!update) {
      problems.push('noUpdate');
    } else {
      const xexpFile = fileNamed(update.files, UPDATE_FILE);
      xexpHash = await sha256(await xexpFile.read(0, xexpFile.size));
      if (xexpHash !== build.xexp_sha256) {
        problems.push('updateDifferent');
      }
    }
    for (const want of build.game_files) {
      const f = fileNamed(game.files, want.path.toLowerCase());
      if (!f || f.size !== want.size) {
        problems.push('gameDifferent');
        break;
      }
    }
  }
  return { xexHash, xexpHash, build, problems };
}

// chosen: findGames(); release: { manifest, nro, licenses } (bytes)
// sink: { write(Uint8Array), close() } receiving the zip file
// onSize(bytes) is called with the exact size of the zip before the first byte is written.
// update: only the program and its licenses, for a folder already on the SD card.
export async function createPackage(chosen, release, sink, log = () => {}, progress = () => {},
  onSize = () => {}, { update = false } = {}) {
  const id = await identifyGames(chosen, release.manifest);
  const { build } = id;
  if (!build) {
    throw new Error(t('notSupportedYet', { hash: id.xexHash }));
  }
  if (id.problems.length) {
    throw new Error(t(id.problems[0]));
  }
  log(t('logBuild', { version: build.version }));
  if (update) {
    log(t('logUpdate'));
  }

  const stage = (from, to) => (f) => progress(from + (to - from) * Math.min(Math.max(f, 0), 1));
  let gameIndex = null;
  let plan = null;
  let dataChecksum = 0n;
  if (!update) {
    // The game pack: the game's files and the title update's default.xexp, as the console mounts them.
    plan = planPack([...chosen.game.files, fileNamed(chosen.update.files, UPDATE_FILE)]);
    log(t('checksumming', { count: plan.items.length }));
    const sum = stage(0, 0.4);
    const fnv = new Fnv64();
    let seen = 0;
    for (const item of plan.items) {
      for await (const chunk of chunksOf(item.file)) {
        fnv.update(chunk);
        seen += chunk.length;
        sum(seen / plan.packSize);
      }
    }
    dataChecksum = fnv.value();
    gameIndex = packIndex(plan, dataChecksum);
  }

  const entries = [
    { path: `${ROOT}/${NRO}`, size: release.nro.length },
    { path: `${ROOT}/LICENSES.txt`, size: release.licenses.length },
    ...(update ? [] : [
      { path: `${ROOT}/game_root.nxidx`, size: gameIndex.length },
      { path: `${ROOT}/game_root.nxpack`, size: plan.packSize },
    ]),
  ];
  onSize(zipSize(entries));
  log(t('packing'));
  const total = update ? 1 : plan.packSize;
  const write = stage(update ? 0 : 0.4, 1);
  let done = 0;
  const onChunk = (chunk) => {
    done += chunk.length;
    write(done / total);
  };
  const zip = new ZipWriter(sink);
  await zip.addBytes(`${ROOT}/${NRO}`, release.nro);
  await zip.addBytes(`${ROOT}/LICENSES.txt`, release.licenses);
  if (!update) {
    await zip.addBytes(`${ROOT}/game_root.nxidx`, gameIndex);
    await zip.addFile(`${ROOT}/game_root.nxpack`, plan.packSize,
      packChunks(plan, dataChecksum, (item) => chunksOf(item.file)), onChunk);
  }
  await zip.finish();
  progress(1);
  log(t('done'));
  return { version: build.version, update };
}
