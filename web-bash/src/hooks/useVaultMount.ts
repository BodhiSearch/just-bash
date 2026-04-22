import { useEffect, useReducer, useRef } from 'react';
import type { FileSystemProvider } from '@/adapters/zenfs-fs-provider';

export type VaultMountStatus = 'idle' | 'mounting' | 'ready' | 'error';

export interface VaultMountPorts {
  mount: (handle: FileSystemDirectoryHandle) => Promise<void>;
  unmount: () => Promise<void>;
  createProvider: (handle: FileSystemDirectoryHandle) => FileSystemProvider;
}

export interface UseVaultMountResult {
  status: VaultMountStatus;
  fsProvider: FileSystemProvider | null;
  error: string | null;
}

type State = UseVaultMountResult;

type Action =
  | { type: 'reset' }
  | { type: 'mounting' }
  | { type: 'ready'; fsProvider: FileSystemProvider }
  | { type: 'error'; message: string };

const INITIAL_STATE: State = {
  status: 'idle',
  fsProvider: null,
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':
      return INITIAL_STATE;
    case 'mounting':
      return { status: 'mounting', fsProvider: null, error: null };
    case 'ready':
      return { status: 'ready', fsProvider: action.fsProvider, error: null };
    case 'error':
      return { status: 'error', fsProvider: null, error: action.message };
    default:
      return state;
  }
}

export function useVaultMount(
  handle: FileSystemDirectoryHandle | null,
  ports: VaultMountPorts
): UseVaultMountResult {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const portsRef = useRef(ports);
  useEffect(() => {
    portsRef.current = ports;
  }, [ports]);

  useEffect(() => {
    let cancelled = false;

    if (!handle) {
      dispatch({ type: 'reset' });
      void portsRef.current.unmount().catch(() => {});
      return;
    }

    dispatch({ type: 'mounting' });

    (async () => {
      try {
        await portsRef.current.mount(handle);
        if (cancelled) return;
        const provider = portsRef.current.createProvider(handle);
        dispatch({ type: 'ready', fsProvider: provider });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle]);

  return state;
}
