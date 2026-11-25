# Third-party notices

| Component | Where | License |
|---|---|---|
| [feedingfrenzy-nx-installer](https://github.com/ChanseyIsTheBest/feedingfrenzy-nx-installer), [bejeweled3-nx-installer](https://github.com/ChanseyIsTheBest/bejeweled3-nx-installer), [peggle1-nx-installer](https://github.com/ChanseyIsTheBest/peggle1-nx-installer) and [peggle2-nx-installer](https://github.com/ChanseyIsTheBest/peggle2-nx-installer) by ChanseyIsTheBest: this page's starting point (the page, the worker, the pack and zip writers, the tests; the title update's search from peggle1-nx-installer) | everything | GPL-3.0 |
| [nfsmw-nx-installer](https://github.com/StevensND/nfsmw-nx-installer) by StevensND (commit `e7ec1b65`): the page's structure and style, the service worker (`sw.js`), the worker's download stream, the zip writer (`lib/zip.js`), the language picker and its flags | `sw.js`, `worker.js`, `app.js`, `index.html`, `lib/` | GPL-3.0 |
| [sa2-nx-installer](https://github.com/ChanseyIsTheBest/sa2-nx-installer) and [futari-nx-installer](https://github.com/ChanseyIsTheBest/futari-nx-installer) by ChanseyIsTheBest: the STFS package reader (`lib/from_sa2/stfs_package.js`), the asset pack writer (`lib/nxpack.js`) | `lib/` | GPL-3.0 |
| [rr6-nx-installer](https://github.com/ChanseyIsTheBest/rr6-nx-installer) by ChanseyIsTheBest: the LZ4 / ZXC packing (`lib/lz4b.js`, `lib/pool.js`, `pack_worker.js`, the WebAssembly builds in `wasm/src/`) | `lib/`, `pack_worker.js`, `wasm/` | GPL-3.0 |
| [sa2-nx-ult-installer](https://github.com/ChanseyIsTheBest/sa2-nx-installer) by ChanseyIsTheBest: the asset pack's version 3 (`lib/nxpack.js`) and the stand-ins made before the pack (`lib/media.js`) | `lib/` | GPL-3.0 |
| [sasrt-nx-installer](https://github.com/ChanseyIsTheBest/sasrt-nx-installer) by ChanseyIsTheBest, after culdcept-nx-installer: the XMA-to-Opus re-encode (`lib/xmop.js`, `lib/audio.js`, `lib/resample.js`, `test/opus_node.mjs`) and the XMA decoder's WebAssembly (`wasm/src/xma/`) | `lib/`, `test/`, `wasm/` | GPL-3.0 |
| [FFmpeg](https://ffmpeg.org) 4.4 (the ReXGlue ports' copy): libavcodec's xmaframes decoder (WMA Pro's, with the ports' frame-by-frame XMA entry) and libavutil, built with that decoder only | `wasm/xma.*` | LGPL-2.1-or-later |
| [LZ4](https://github.com/lz4/lz4) 1.10.0 by Yann Collet: `lz4.c`, `lz4.h`, `lz4hc.c`, `lz4hc.h`, unmodified | `wasm/src/lz4/`, `wasm/lz4.*` | BSD 2-Clause (`wasm/src/lz4/LICENSE`) |
| [ZXC](https://github.com/hellobertrand/zxc) 0.15.0 by Bertrand Lebonnois: its library, unmodified but for `zxc_driver.c` left out | `wasm/src/zxc/`, `wasm/zxc.*` | BSD 3-Clause (`wasm/src/zxc/LICENSE`) |
| [rapidhash](https://github.com/Nicoshev/rapidhash) by Nicolas De Carli, bundled with ZXC | `wasm/src/zxc/src/lib/vendors/rapidhash.h`, `wasm/zxc.*` | MIT (`wasm/src/zxc/THIRD_PARTY_NOTICES`) |

The licenses of the software in the package (the NRO and its libraries) are in [release/LICENSES.txt](release/LICENSES.txt),
and the source code with its license is at https://github.com/ChanseyIsTheBest/zuma-nx.

The icon is the game's artwork, © PopCap Games.
