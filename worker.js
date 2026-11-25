// Runs the whole package build off the main thread and streams the zip to the download service worker.
// From bejeweled3-nx-installer's worker.js, without the shader step's WebAssembly modules.
import { createPackage, findGames, identifyGames, releasePath, sha256 } from './lib/installer.js';
import { setLanguage, t } from './lib/i18n.js';
import { CODECS } from './lib/lz4b.js';
import { workerPool } from './lib/pool.js';
import { canEncodeOpus, encodeWebCodecs } from './lib/audio.js';
import createXmaModule from './wasm/xma.mjs';

// The PopCap ports (2026-11-24, rr6-nx-installer's worker.js): count pack_worker.js workers (LZ4 HC and ZXC in
// WebAssembly), each started and ready, as lib/pool.js takes them.
function startPackWorkers(count) {
  return Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
    const w = new Worker('./pack_worker.js', { type: 'module' });
    w.onerror = (e) => reject(new Error(`pack_worker.js: ${e.message}`));
    w.addEventListener('message', ({ data }) => {
      if (data.ready) {
        resolve({ w, post: (m, transfer) => w.postMessage(m, transfer),
          onMessage: (cb) => w.addEventListener('message', ({ data: d }) => cb(d)) });
      }
    }, { once: true });
  })));
}

// The PopCap ports (2026-11-24): the sounds' Opus re-encode for lib/media.js, when this browser has an Opus encoder
// (WebCodecs); without one the sounds stay XMA. wasm/xma made once.
let xmaModule = null;
async function audioMaker() {
  if (!(await canEncodeOpus())) {
    log(t('noOpusEncoder'));
    return null;
  }
  if (!xmaModule) xmaModule = await createXmaModule({ print: () => {}, printErr: () => {} });
  return { xma: xmaModule, encode: encodeWebCodecs, jobs: 6 };
}

// compress(bytes, codec) for lib/media.js: the block on the next free packing worker (made at the first package).
let packCompress = null;
async function packCompressor() {
  if (!packCompress) {
    const cores = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    const pool = workerPool(await startPackWorkers(cores));
    packCompress = (bytes, codec) => pool.run({ bytes, codec, level: CODECS[codec].level, block: CODECS[codec].block },
      [bytes.buffer]).then((r) => r.bytes);
  }
  return packCompress;
}

const log = (text) => postMessage({ type: 'log', text });
const progress = (fraction) => postMessage({ type: 'progress', fraction });

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(t('downloadFailed', { url, status: response.status }));
  }
  return new Uint8Array(await response.arrayBuffer());
}

// A release file, checked against the SHA-256 the manifest gives for it.
async function fetchChecked(name, hash) {
  const bytes = await fetchBytes(releasePath(name, hash));
  const got = await sha256(bytes);
  if (got !== hash) {
    throw new Error(t('buildMismatch', { name, hash: got }));
  }
  return bytes;
}

// Sends every write as one chunk, and only when the download has asked for more ("pull").
function portSink(port) {
  let credits = 0;
  let cancelled = false;
  let waiting = null;
  port.onmessage = ({ data }) => {
    if (data.type === 'pull') {
      credits++;
    } else if (data.type === 'cancel') {
      cancelled = true;
    }
    if (waiting) {
      const wake = waiting;
      waiting = null;
      wake();
    }
  };
  return {
    async write(bytes) {
      while (!credits) {
        if (cancelled) {
          throw new Error(t('cancelled'));
        }
        await new Promise((resolve) => (waiting = resolve));
      }
      if (cancelled) {
        throw new Error(t('cancelled'));
      }
      credits--;
      const copy = bytes.slice();
      port.postMessage({ type: 'chunk', buffer: copy.buffer }, [copy.buffer]);
    },
    async close() {
      port.postMessage({ type: 'end' });
    },
    fail(message) {
      port.postMessage({ type: 'error', message });
    },
  };
}

// The files the page received from the player, in the form lib/installer.js reads them.
function chosenFiles(entries) {
  return entries.map(({ path, file }) => ({
    path,
    size: file.size,
    read: async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
  }));
}

self.onmessage = async ({ data }) => {
  setLanguage(data.lang);
  const sink = portSink(data.port);
  try {
    log(t('readingFiles'));
    const chosen = await findGames(chosenFiles(data.entries));
    if (!chosen.game) {
      throw new Error(t('noGame'));
    }
    const manifest = JSON.parse(new TextDecoder().decode(await fetchBytes('./release/manifest.json')));
    const { build, xexHash } = await identifyGames(chosen, manifest);
    if (!build) {
      throw new Error(t('notSupportedYet', { hash: xexHash }));
    }
    log(t('downloadingBuild'));
    const [nro, licenses] = await Promise.all([
      fetchChecked(build.nro, build.nro_sha256),
      fetchBytes('./release/LICENSES.txt'),
    ]);
    const release = { manifest, nro, licenses };
    const result = await createPackage(chosen, release, sink, log, progress,
      (size) => postMessage({ type: 'size', size }), { update: Boolean(data.update), compress: data.update ? null : await packCompressor(),
        audio: data.update ? null : await audioMaker() });
    postMessage({ type: 'done', result });
  } catch (error) {
    const message = error.message || String(error);
    sink.fail(message);
    postMessage({ type: 'error', message });
  }
};
