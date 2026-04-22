/**
 * zenfs-fs-provider.ts — thin provider surface around ZenFS's fs.promises.
 *
 * Created in Stage 1 as a no-op-like wrapper so Stage 2 (wiring just-bash as
 * an AgentTool) can plug into a single consistent provider abstraction
 * without reshaping the UI layer. All calls route through the VFS mounted
 * at VAULT_MOUNT by zenfs-provider / in-memory-vault.
 */

import { fs } from '@zenfs/core';
import { VAULT_MOUNT } from './zenfs-provider';

export interface FileSystemProvider {
  readonly rootName: string;
  readonly mountPath: string;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number }>;
}

export class ZenFsProvider implements FileSystemProvider {
  readonly mountPath = VAULT_MOUNT;
  readonly rootName: string;

  constructor(rootName: string) {
    this.rootName = rootName;
  }

  async readFile(path: string): Promise<string> {
    const buf = await fs.promises.readFile(path);
    return typeof buf === 'string' ? buf : new TextDecoder().decode(buf as Uint8Array);
  }

  async writeFile(path: string, data: string): Promise<void> {
    await fs.promises.writeFile(path, data, { encoding: 'utf8' });
  }

  async readdir(path: string): Promise<string[]> {
    const entries = await fs.promises.readdir(path);
    return entries.map(e => (typeof e === 'string' ? e : (e as { name: string }).name));
  }

  async stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number }> {
    const s = await fs.promises.stat(path);
    return {
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
      size: Number(s.size),
    };
  }
}
