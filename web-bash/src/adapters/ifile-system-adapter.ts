/**
 * ifile-system-adapter.ts — IFileSystem implementation backed by ZenFS fs.promises.
 *
 * Bridges just-bash's async IFileSystem contract to the /vault-mounted ZenFS
 * VFS configured in zenfs-provider.ts / in-memory-vault.ts. No path rewriting
 * is done — callers must pass absolute paths under /vault (matching the
 * mounted prefix) and set cwd to /vault on the Bash instance. getAllPaths()
 * returns [] per the optional-empty contract; globs fall back to readdir.
 */

import { fs } from '@zenfs/core';
import type {
  BufferEncoding,
  CpOptions,
  DirentEntry,
  FileContent,
  FsStat,
  IFileSystem,
  MkdirOptions,
  ReadFileOptions,
  RmOptions,
  WriteFileOptions,
} from 'just-bash';

type AnyStats = {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  mode: number | bigint;
  size: number | bigint;
  mtime: Date;
};

function mapStat(s: AnyStats): FsStat {
  return {
    isFile: s.isFile(),
    isDirectory: s.isDirectory(),
    isSymbolicLink: s.isSymbolicLink(),
    mode: Number(s.mode ?? 0),
    size: Number(s.size ?? 0),
    mtime: s.mtime instanceof Date ? s.mtime : new Date(s.mtime),
  };
}

function decodeEncoding(enc?: BufferEncoding | null): string {
  if (!enc) return 'utf8';
  return enc === 'utf-8' ? 'utf8' : enc;
}

function toUint8(content: FileContent): Uint8Array | string {
  if (typeof content === 'string') return content;
  return content;
}

function normalizePosix(p: string): string {
  if (p === '') return '.';
  const isAbs = p.startsWith('/');
  const segments: string[] = [];
  for (const raw of p.split('/')) {
    if (raw === '' || raw === '.') continue;
    if (raw === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') {
        segments.pop();
      } else if (!isAbs) {
        segments.push('..');
      }
      continue;
    }
    segments.push(raw);
  }
  const joined = segments.join('/');
  if (isAbs) return '/' + joined;
  return joined === '' ? '.' : joined;
}

function resolveJoin(base: string, p: string): string {
  if (p.startsWith('/')) return normalizePosix(p);
  const baseNorm = normalizePosix(base || '/');
  const combined = baseNorm === '/' ? '/' + p : baseNorm + '/' + p;
  return normalizePosix(combined);
}

function isNotFound(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

class ZenFsIFileSystem implements IFileSystem {
  async readFile(path: string, options?: ReadFileOptions | BufferEncoding): Promise<string> {
    const encoding = typeof options === 'string' ? options : (options?.encoding ?? 'utf8');
    const enc = decodeEncoding(encoding);
    const raw = await fs.promises.readFile(path);
    if (typeof raw === 'string') return raw;
    const bytes = raw as unknown as Uint8Array;
    if (enc === 'utf8') return new TextDecoder('utf-8').decode(bytes);
    if (enc === 'latin1' || enc === 'binary') {
      let out = '';
      for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
      return out;
    }
    if (enc === 'ascii') {
      let out = '';
      for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i] & 0x7f);
      return out;
    }
    if (enc === 'base64') {
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }
    if (enc === 'hex') {
      let out = '';
      for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
      }
      return out;
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const raw = await fs.promises.readFile(path);
    if (typeof raw === 'string') return new TextEncoder().encode(raw);
    return new Uint8Array(raw as unknown as Uint8Array);
  }

  async writeFile(
    path: string,
    content: FileContent,
    options?: WriteFileOptions | BufferEncoding
  ): Promise<void> {
    const encoding = typeof options === 'string' ? options : (options?.encoding ?? 'utf8');
    const enc = decodeEncoding(encoding);
    const payload = toUint8(content);
    if (typeof payload === 'string') {
      await fs.promises.writeFile(path, payload, { encoding: enc as BufferEncoding });
    } else {
      await fs.promises.writeFile(path, payload);
    }
  }

  async appendFile(
    path: string,
    content: FileContent,
    options?: WriteFileOptions | BufferEncoding
  ): Promise<void> {
    const encoding = typeof options === 'string' ? options : (options?.encoding ?? 'utf8');
    const enc = decodeEncoding(encoding);
    const payload = toUint8(content);
    if (typeof payload === 'string') {
      await fs.promises.appendFile(path, payload, { encoding: enc as BufferEncoding });
    } else {
      await fs.promises.appendFile(path, payload);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.promises.stat(path);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      return false;
    }
  }

  async stat(path: string): Promise<FsStat> {
    const s = await fs.promises.stat(path);
    return mapStat(s as unknown as AnyStats);
  }

  async lstat(path: string): Promise<FsStat> {
    const s = await fs.promises.lstat(path);
    return mapStat(s as unknown as AnyStats);
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    await fs.promises.mkdir(path, { recursive: options?.recursive ?? false });
  }

  async readdir(path: string): Promise<string[]> {
    const entries = await fs.promises.readdir(path);
    return entries.map(e => (typeof e === 'string' ? e : (e as { name: string }).name));
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    const names = await this.readdir(path);
    const out: DirentEntry[] = [];
    for (const name of names) {
      const full = resolveJoin(path, name);
      try {
        const s = await fs.promises.lstat(full);
        out.push({
          name,
          isFile: s.isFile(),
          isDirectory: s.isDirectory(),
          isSymbolicLink: s.isSymbolicLink(),
        });
      } catch {
        out.push({ name, isFile: false, isDirectory: false, isSymbolicLink: false });
      }
    }
    return out;
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    const force = options?.force ?? false;
    const recursive = options?.recursive ?? false;
    try {
      const s = await fs.promises.lstat(path);
      if (s.isDirectory()) {
        if (!recursive) {
          await fs.promises.rmdir(path);
          return;
        }
        await this.rmRecursive(path);
        return;
      }
      await fs.promises.unlink(path);
    } catch (err) {
      if (force && isNotFound(err)) return;
      throw err;
    }
  }

  private async rmRecursive(path: string): Promise<void> {
    const entries = await fs.promises.readdir(path);
    const names = entries.map(e => (typeof e === 'string' ? e : (e as { name: string }).name));
    for (const name of names) {
      const child = resolveJoin(path, name);
      const s = await fs.promises.lstat(child);
      if (s.isDirectory()) {
        await this.rmRecursive(child);
      } else {
        await fs.promises.unlink(child);
      }
    }
    await fs.promises.rmdir(path);
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const s = await fs.promises.lstat(src);
    if (s.isDirectory()) {
      if (!options?.recursive) {
        throw Object.assign(new Error(`cp: -r not specified; omitting directory '${src}'`), {
          code: 'EISDIR',
        });
      }
      await this.cpRecursive(src, dest);
      return;
    }
    if (s.isSymbolicLink()) {
      const target = await fs.promises.readlink(src);
      await fs.promises.symlink(target, dest);
      return;
    }
    const data = await fs.promises.readFile(src);
    if (typeof data === 'string') {
      await fs.promises.writeFile(dest, data);
    } else {
      await fs.promises.writeFile(dest, data as unknown as Uint8Array);
    }
    try {
      await fs.promises.chmod(dest, Number(s.mode));
    } catch {
      // ignore chmod failures
    }
  }

  private async cpRecursive(src: string, dest: string): Promise<void> {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src);
    const names = entries.map(e => (typeof e === 'string' ? e : (e as { name: string }).name));
    for (const name of names) {
      const from = resolveJoin(src, name);
      const to = resolveJoin(dest, name);
      const s = await fs.promises.lstat(from);
      if (s.isDirectory()) {
        await this.cpRecursive(from, to);
      } else if (s.isSymbolicLink()) {
        const target = await fs.promises.readlink(from);
        await fs.promises.symlink(target, to);
      } else {
        const data = await fs.promises.readFile(from);
        if (typeof data === 'string') {
          await fs.promises.writeFile(to, data);
        } else {
          await fs.promises.writeFile(to, data as unknown as Uint8Array);
        }
        try {
          await fs.promises.chmod(to, Number(s.mode));
        } catch {
          // ignore
        }
      }
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    await fs.promises.rename(src, dest);
  }

  resolvePath(base: string, path: string): string {
    return resolveJoin(base, path);
  }

  getAllPaths(): string[] {
    return [];
  }

  async chmod(path: string, mode: number): Promise<void> {
    await fs.promises.chmod(path, mode);
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    await fs.promises.symlink(target, linkPath);
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    await fs.promises.link(existingPath, newPath);
  }

  async readlink(path: string): Promise<string> {
    const out = await fs.promises.readlink(path);
    return typeof out === 'string' ? out : String(out);
  }

  async realpath(path: string): Promise<string> {
    const out = await fs.promises.realpath(path);
    return typeof out === 'string' ? out : String(out);
  }

  async utimes(path: string, atime: Date, mtime: Date): Promise<void> {
    await fs.promises.utimes(path, atime, mtime);
  }
}

export function createZenFsBackedIFileSystem(): IFileSystem {
  return new ZenFsIFileSystem();
}
