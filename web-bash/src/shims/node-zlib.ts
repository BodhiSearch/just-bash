/**
 * Browser shim for node:zlib used by just-bash's browser bundle.
 *
 * just-bash's browser bundle leaves node:zlib as an external import (only the
 * gzip/gunzip/zcat and rg *.gz branches actually reach it). Vite's default
 * externalised-builtin wrapper throws on *any* property access, which breaks
 * the ESM import itself because the minified bundle touches the binding at
 * module load time. This shim keeps module import free of side effects; the
 * underlying functions throw only if they are invoked at runtime, matching the
 * documented expectation that gzip/gunzip/zcat fail in the browser.
 */

function unavailable(name: string): () => never {
  return () => {
    throw new Error(`node:zlib.${name} is not available in the browser bundle`);
  };
}

export const gzipSync = unavailable('gzipSync');
export const gunzipSync = unavailable('gunzipSync');
export const deflateSync = unavailable('deflateSync');
export const inflateSync = unavailable('inflateSync');
export const brotliCompressSync = unavailable('brotliCompressSync');
export const brotliDecompressSync = unavailable('brotliDecompressSync');

export const constants = {
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
};

export default {
  gzipSync,
  gunzipSync,
  deflateSync,
  inflateSync,
  brotliCompressSync,
  brotliDecompressSync,
  constants,
};
