import { useEffect, useState } from 'react';
import type { VaultMountPorts } from './useVaultMount';

interface ZenfsSeed {
  files: Record<string, string>;
  name: string;
}

export interface DevSeedBoot {
  handle: FileSystemDirectoryHandle;
  ports: VaultMountPorts;
}

export interface UseDevSeedBootResult {
  ready: boolean;
  boot: DevSeedBoot | null;
}

/**
 * Dev-only e2e seam: detect a test-seeded in-memory vault on
 * window.__zenfsSeed and load the InMemory adapter lazily. In production the
 * dynamic import is tree-shaken out because import.meta.env.DEV is replaced
 * at build time.
 */
export function useDevSeedBoot(): UseDevSeedBootResult {
  const [state, setState] = useState<UseDevSeedBootResult>(() => {
    if (!import.meta.env.DEV) return { ready: true, boot: null };
    const seed = (window as unknown as { __zenfsSeed?: ZenfsSeed }).__zenfsSeed;
    if (!seed) return { ready: true, boot: null };
    return { ready: false, boot: null };
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const seed = (window as unknown as { __zenfsSeed?: ZenfsSeed }).__zenfsSeed;
    if (!seed) return;
    let cancelled = false;
    (async () => {
      const mod = await import('@/adapters/in-memory-vault');
      if (cancelled) return;
      const ports = mod.createInMemoryVaultAdapter(seed);
      const handle = mod.createInMemoryDirectoryHandle(seed.name);
      // Pre-mount so useFileTree's initial walk sees the seeded files.
      await ports.mount(handle);
      if (cancelled) return;
      setState({ ready: true, boot: { handle, ports } });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
