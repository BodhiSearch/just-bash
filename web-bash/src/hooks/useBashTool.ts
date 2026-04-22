/**
 * useBashTool — tiny hook that holds the "bash tool enabled" toggle and
 * exposes an AgentTool[] with a single entry (or empty) so callers can
 * concatenate it into the aggregate tools list fed to useAgent.
 */

import { useCallback, useMemo, useState } from 'react';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { createBashTool } from '@/tools/bashTool';

const STORAGE_KEY = 'web-bash-tool-enabled';

function loadInitial(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

function persist(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // silent fail
  }
}

export interface UseBashToolResult {
  bashEnabled: boolean;
  toggleBash: () => void;
  bashTools: AgentTool[];
}

export function useBashTool(): UseBashToolResult {
  const [bashEnabled, setBashEnabled] = useState<boolean>(loadInitial);

  const toggleBash = useCallback(() => {
    setBashEnabled(prev => {
      const next = !prev;
      persist(next);
      return next;
    });
  }, []);

  const bashTools = useMemo<AgentTool[]>(() => {
    if (!bashEnabled) return [];
    return [createBashTool() as unknown as AgentTool];
  }, [bashEnabled]);

  return { bashEnabled, toggleBash, bashTools };
}
