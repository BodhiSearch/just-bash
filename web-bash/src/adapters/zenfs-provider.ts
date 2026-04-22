/**
 * zenfs-provider.ts — Mount a FileSystemDirectoryHandle at /vault via ZenFS.
 *
 * Uses @zenfs/dom's WebAccess backend to wrap the native FSA handle picked
 * via window.showDirectoryPicker(). The re-exported fs reference is shared
 * so the in-memory adapter and future bash tool resolve to the same VFS.
 */

import { configure, fs, vfs } from '@zenfs/core';
import { WebAccess } from '@zenfs/dom';

export { fs };

export const VAULT_MOUNT = '/vault';

let mounted = false;

export async function mountVault(handle: FileSystemDirectoryHandle): Promise<void> {
  if (mounted) {
    await unmountVault();
  }
  await configure({ mounts: {} });
  const webAccessFs = await WebAccess.create({ handle });
  vfs.mount(VAULT_MOUNT, webAccessFs);
  mounted = true;
}

export async function unmountVault(): Promise<void> {
  if (!mounted) return;
  try {
    vfs.umount(VAULT_MOUNT);
  } catch {
    // Mount may not exist if the page was freshly loaded.
  }
  mounted = false;
}

export function isVaultMounted(): boolean {
  return mounted;
}
