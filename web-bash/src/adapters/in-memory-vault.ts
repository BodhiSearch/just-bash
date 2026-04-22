/**
 * in-memory-vault.ts — ZenFS InMemory-backed vault for E2E tests.
 *
 * TEST-ONLY. Loaded lazily from App.tsx under import.meta.env.DEV when
 * window.__zenfsSeed is present. Exposes the same {mount, unmount,
 * createProvider} port shape as the production WebAccess adapter so
 * useVaultMount can stay adapter-agnostic.
 */

import { configure, fs, vfs, InMemory } from '@zenfs/core';
import { VAULT_MOUNT } from './zenfs-provider';

export interface InMemoryVaultSeed {
  /** Absolute paths rooted at /vault, mapped to UTF-8 file contents. */
  files: Record<string, string>;
  /** Display name for the synthetic vault root. */
  name: string;
}

export interface InMemoryVaultAdapter {
  mount: (handle: FileSystemDirectoryHandle) => Promise<void>;
  unmount: () => Promise<void>;
}

export function createInMemoryVaultAdapter(seed: InMemoryVaultSeed): InMemoryVaultAdapter {
  let mounted = false;

  // The FSA handle is ignored on the InMemory path — the seed carries the
  // data. The ports shape matches the production WebAccess adapter.
  async function mount(): Promise<void> {
    // Idempotent re-mount: Layout pre-mounts during boot, then useVaultMount
    // fires again with the synthetic handle and calls mount() a second time.
    // Re-mounting would wipe any writes that landed between the two calls.
    if (mounted) return;
    await configure({ mounts: {} });
    const memFs = InMemory.create({ label: seed.name });
    vfs.mount(VAULT_MOUNT, memFs);

    const paths = Object.keys(seed.files).sort();
    for (const absPath of paths) {
      const lastSlash = absPath.lastIndexOf('/');
      if (lastSlash > 0) {
        const parent = absPath.slice(0, lastSlash);
        try {
          await fs.promises.mkdir(parent, { recursive: true });
        } catch (err: unknown) {
          if (
            err === null ||
            typeof err !== 'object' ||
            !('code' in err) ||
            (err as { code?: string }).code !== 'EEXIST'
          ) {
            throw err;
          }
        }
      }
      await fs.promises.writeFile(absPath, seed.files[absPath], { encoding: 'utf8' });
    }

    mounted = true;

    // Test-only hook: expose fs.promises so Playwright specs can read back
    // the ZenFS state directly when the UI tree is stale.
    (window as unknown as { __zenfsFs?: unknown }).__zenfsFs = fs.promises;
  }

  async function unmount(): Promise<void> {
    if (!mounted) return;
    try {
      vfs.umount(VAULT_MOUNT);
    } catch {
      // Mount may not exist.
    }
    mounted = false;
  }

  return { mount, unmount };
}

/**
 * Build a synthetic FileSystemDirectoryHandle whose reads and writes are
 * backed by ZenFS /vault. The file-tree hook treats it like a real FSA handle.
 */
export function createInMemoryDirectoryHandle(name: string): FileSystemDirectoryHandle {
  return buildDirHandle(VAULT_MOUNT, name);
}

function joinPath(parent: string, child: string): string {
  if (parent === '/') return '/' + child;
  return parent + '/' + child;
}

function buildFileHandle(absPath: string, entryName: string): FileSystemFileHandle {
  const handle: unknown = {
    kind: 'file' as const,
    name: entryName,
    isSameEntry: async () => false,
    queryPermission: async () => 'granted' as const,
    requestPermission: async () => 'granted' as const,
    getFile: async () => {
      const buf = await fs.promises.readFile(absPath);
      const bytes = new Uint8Array(buf as unknown as ArrayBuffer);
      return new File([bytes], entryName);
    },
    createWritable: async () => {
      const chunks: Uint8Array[] = [];
      return {
        write: async (data: unknown) => {
          if (typeof data === 'string') {
            chunks.push(new TextEncoder().encode(data));
          } else if (data instanceof Blob) {
            const ab = await data.arrayBuffer();
            chunks.push(new Uint8Array(ab));
          } else if (data !== null && typeof data === 'object' && 'data' in data) {
            const inner = (data as { data: unknown }).data;
            if (typeof inner === 'string') {
              chunks.push(new TextEncoder().encode(inner));
            } else if (inner instanceof Blob) {
              const ab = await inner.arrayBuffer();
              chunks.push(new Uint8Array(ab));
            } else {
              chunks.push(new TextEncoder().encode(String(inner)));
            }
          } else {
            chunks.push(new TextEncoder().encode(String(data)));
          }
        },
        close: async () => {
          const total = chunks.reduce((n, c) => n + c.byteLength, 0);
          const merged = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) {
            merged.set(c, off);
            off += c.byteLength;
          }
          await fs.promises.writeFile(absPath, merged);
        },
        abort: async () => {},
      };
    },
  };
  return handle as FileSystemFileHandle;
}

function buildDirHandle(absPath: string, entryName: string): FileSystemDirectoryHandle {
  const handle: unknown = {
    kind: 'directory' as const,
    name: entryName,
    isSameEntry: async () => false,
    queryPermission: async () => 'granted' as const,
    requestPermission: async () => 'granted' as const,
    resolve: async () => null,
    getDirectoryHandle: async (childName: string, options?: { create?: boolean }) => {
      const childPath = joinPath(absPath, childName);
      try {
        const stat = await fs.promises.stat(childPath);
        if (!stat.isDirectory()) {
          throw new DOMException('Not a directory', 'TypeMismatchError');
        }
      } catch (err: unknown) {
        if (options?.create) {
          await fs.promises.mkdir(childPath, { recursive: true });
        } else {
          throw new DOMException((err as Error)?.message ?? 'Not found', 'NotFoundError');
        }
      }
      return buildDirHandle(childPath, childName);
    },
    getFileHandle: async (childName: string, options?: { create?: boolean }) => {
      const childPath = joinPath(absPath, childName);
      try {
        const stat = await fs.promises.stat(childPath);
        if (!stat.isFile()) {
          throw new DOMException('Not a file', 'TypeMismatchError');
        }
      } catch (err: unknown) {
        if (options?.create) {
          await fs.promises.writeFile(childPath, '', { encoding: 'utf8' });
        } else {
          throw new DOMException((err as Error)?.message ?? 'Not found', 'NotFoundError');
        }
      }
      return buildFileHandle(childPath, childName);
    },
    removeEntry: async (childName: string) => {
      const childPath = joinPath(absPath, childName);
      try {
        const stat = await fs.promises.stat(childPath);
        if (stat.isDirectory()) {
          await fs.promises.rmdir(childPath);
        } else {
          await fs.promises.unlink(childPath);
        }
      } catch (err: unknown) {
        throw new DOMException((err as Error)?.message ?? 'Not found', 'NotFoundError');
      }
    },
    entries: () => {
      let children: string[] | null = null;
      let idx = 0;
      const loadChildren = async (): Promise<string[]> => {
        if (children !== null) return children;
        const rawEntries = await fs.promises.readdir(absPath);
        children = rawEntries.map(e => (typeof e === 'string' ? e : (e as { name: string }).name));
        return children;
      };
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          const names = await loadChildren();
          if (idx >= names.length) return { done: true, value: undefined };
          const name = names[idx++];
          const childPath = joinPath(absPath, name);
          const stat = await fs.promises.stat(childPath);
          const childHandle = stat.isDirectory()
            ? buildDirHandle(childPath, name)
            : buildFileHandle(childPath, name);
          return { done: false, value: [name, childHandle] };
        },
      };
    },
    keys: () => {
      let names: string[] | null = null;
      let idx = 0;
      const load = async (): Promise<string[]> => {
        if (names !== null) return names;
        const raw = await fs.promises.readdir(absPath);
        names = raw.map(e => (typeof e === 'string' ? e : (e as { name: string }).name));
        return names;
      };
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          const all = await load();
          if (idx >= all.length) return { done: true, value: undefined };
          return { done: false, value: all[idx++] };
        },
      };
    },
    values: () => {
      let names: string[] | null = null;
      let idx = 0;
      const load = async (): Promise<string[]> => {
        if (names !== null) return names;
        const raw = await fs.promises.readdir(absPath);
        names = raw.map(e => (typeof e === 'string' ? e : (e as { name: string }).name));
        return names;
      };
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          const all = await load();
          if (idx >= all.length) return { done: true, value: undefined };
          const name = all[idx++];
          const childPath = joinPath(absPath, name);
          const stat = await fs.promises.stat(childPath);
          const childHandle = stat.isDirectory()
            ? buildDirHandle(childPath, name)
            : buildFileHandle(childPath, name);
          return { done: false, value: childHandle };
        },
      };
    },
  };
  return handle as FileSystemDirectoryHandle;
}
