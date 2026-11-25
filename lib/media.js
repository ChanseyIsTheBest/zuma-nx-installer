// The PopCap ports (2026-11-24, the user: "add audio and video compression ... zxc/l4z compress all the files. make
// sure all videos are zxc compressed"; "look at sonic adventure 2 how it has the web installer and index and changes to
// work with the pack"): what goes into the game pack for each of the game's files, as sa2-nx-ult-installer's
// lib/install.js does it.
//   - A game archive with XMA sounds in it (lib/xma_sounds.js: Bejeweled 3's and Zuma's Revenge's main.rsb, Zuma's and
//     Feeding Frenzy 2's .xpr, Feeding Frenzy's wave bank, Peggle's aux_sounds.pak) becomes NAME.xmop (lib/audio.js:
//     its sounds' frames as Opus, every other byte as it was), packed as LZ4 or ZXC blocks: NAME.xmop.lz4b.
//   - Every other file but default.xex and default.xexp (the runtime loads the module itself) is stored as LZ4 or ZXC
//     blocks, NAME.lz4b (lib/lz4b.js; codecFor picks the codec, the videos are ZXC).
// Each stand-in carries NAME's size as its guest size: the pack's version 3 (lib/nxpack.js) puts both in its index, so
// the console mounts NAME without reading the stand-in's header (the SDK's pack_device.cpp, from sa2-nx-ult). A block
// that does not get smaller is stored as it is, so a file that does not compress costs 48 bytes and 4 a block.
//
// Each stand-in is made once and kept as a Blob (the browser keeps large ones on disk); the pack's checksum pass and
// its writing then read the Blobs.
import { makeXmop } from './audio.js';
import { codecFor, pack, SUFFIX } from './lz4b.js';
import { XMOP_SUFFIX } from './xmop.js';

const CHUNK = 16 * 1024 * 1024;
// the files searched for XMA sounds (read whole): the games' archives
const ARCHIVE = /\.(rsb|xpr|xwb|pak)$/i;
const MAX_ARCHIVE = 1024 * 1024 * 1024;

async function* plain(file) {
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    yield await file.read(offset, Math.min(CHUNK, file.size - offset));
  }
}

async function* blobChunks(blob, size = 8 << 20) {
  for (let at = 0; at < blob.size; at += size) yield new Uint8Array(await blob.slice(at, at + size).arrayBuffer());
}

const blobFile = (blob) => ({
  size: blob.size,
  read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
});

async function readAll(file) {
  const bytes = new Uint8Array(file.size);
  for (let at = 0; at < file.size; at += CHUNK) bytes.set(await file.read(at, Math.min(CHUNK, file.size - at)), at);
  return bytes;
}

// The stored form of each game file ([{ path, size, read }]): [{ path, size, guestSize, chunks() }] as lib/nxpack.js
// planPack takes them, the sizes before and after, and the audio's account.
// compress(bytes, codec) -> Promise<Uint8Array> (pack_worker.js through lib/pool.js, or test/compress_node.mjs).
// audio: { xma (an instance of wasm/xma.mjs), encode (lib/audio.js encodeWebCodecs, or test/opus_node.mjs), jobs } to
// re-encode the sounds, or null (a browser without an Opus encoder: the sounds stay XMA).
// onProgress(fraction) follows the files done; log(text) reports each archive's sounds.
export async function prepareFiles(files, compress, { onProgress = () => {}, inFlight = 64, audio = null,
  log = () => {} } = {}) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const total = sorted.reduce((sum, f) => sum + f.size, 0) || 1;
  let done = 0;
  const out = [];
  const sounds = { files: 0, made: 0, xmaBytes: 0, before: 0, after: 0 };
  let xmopIndex = 0;
  for (const file of sorted) {
    const codec = codecFor(file.path);
    if (!codec) {
      out.push({ path: file.path, size: file.size, guestSize: file.size, chunks: () => plain(file) });
      done += file.size;
      onProgress(done / total);
      continue;
    }
    let source = file;
    let path = file.path;
    if (audio && ARCHIVE.test(file.path) && file.size <= MAX_ARCHIVE) {
      const bytes = await readAll(file);
      const x = await makeXmop(bytes, audio.xma, { pack: xmopIndex, encode: audio.encode, jobs: audio.jobs });
      if (x.parts) {
        ++xmopIndex;
        const blob = new Blob(x.parts);
        source = blobFile(blob);
        path = file.path + XMOP_SUFFIX;
        sounds.files++;
        sounds.made += x.made;
        sounds.before += file.size;
        sounds.after += blob.size;
        log(`${file.path}: ${x.made} of ${x.candidates} sounds as Opus (${(file.size / 1048576).toFixed(1)} MB to ` +
            `${(blob.size / 1048576).toFixed(1)} MB${x.kept.length ? `; kept as XMA: ${x.kept.map(([w, n]) => `${n} ${w}`).join(', ')}` : ''})`);
      } else if (!/no XMA sounds/.test(x.why)) {
        log(`${file.path}: its sounds stay XMA (${x.why})`);
      }
    }
    const kept = [];
    const before = done;
    const onRaw = (n) => {
      done = Math.min(before + file.size, done + n * file.size / source.size);
      onProgress(done / total);
    };
    for await (const part of pack(source, compress, { codec, inFlight, onRaw })) kept.push(part);
    done = before + file.size;
    const blob = new Blob(kept);
    out.push({ path: path + SUFFIX, size: blob.size, guestSize: file.size, chunks: () => blobChunks(blob) });
  }
  return { files: out, before: total, after: out.reduce((sum, f) => sum + f.size, 0), sounds };
}
