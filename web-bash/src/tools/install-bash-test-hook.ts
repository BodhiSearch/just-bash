/**
 * install-bash-test-hook.ts — dev/test-only `window.__bashExec` hook.
 *
 * Exposes the same bash AgentTool execute path that the agent uses, but
 * callable directly from Playwright via page.evaluate. This is NOT used in
 * production: it's gated by import.meta.env.DEV so the dead branch is
 * tree-shaken out of prod builds. It lets grammar/control-flow specs avoid
 * the lossy LLM round-trip for multi-line commands (heredocs, etc.) while
 * still using the real Bash + IFileSystem wiring.
 */

import { createBashTool, type BashToolDetails } from '@/tools/bashTool';

export interface BashExecHookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
  formatted: string;
}

export function installBashTestHook(): void {
  if (!import.meta.env.DEV) return;
  if (typeof window === 'undefined') return;
  if ((window as unknown as { __bashExec?: unknown }).__bashExec) return;

  const tool = createBashTool();
  (window as unknown as { __bashExec: unknown }).__bashExec = async (
    command: string,
    cwd?: string
  ): Promise<BashExecHookResult> => {
    const result = await tool.execute('test-hook', { command, cwd });
    const details = result.details as BashToolDetails;
    const textPart = result.content.find(c => c.type === 'text');
    const formatted = textPart && 'text' in textPart ? (textPart as { text: string }).text : '';
    return { ...details, formatted };
  };
}
