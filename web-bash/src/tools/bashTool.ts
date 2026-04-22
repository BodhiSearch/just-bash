/**
 * bashTool.ts — AgentTool that runs a bash command in the mounted /vault ZenFS.
 *
 * Stateless per call: every invocation spins up a fresh Bash instance with
 * cwd=/vault and a ZenFS-backed IFileSystem. `cd`, `export`, aliases, and
 * functions have no cross-call memory. stdout/stderr are each capped at
 * STREAM_CAP bytes; overflow is replaced with a truncation marker. Result
 * content is a single text block; structured fields live on details.
 */

import { Type } from '@mariozechner/pi-ai';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Bash } from 'just-bash';
import { createZenFsBackedIFileSystem } from '@/adapters/ifile-system-adapter';
import { VAULT_MOUNT } from '@/adapters/zenfs-provider';

const STREAM_CAP = 64 * 1024;

interface BashParams {
  command: string;
  cwd?: string;
}

export interface BashToolDetails {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  durationMs: number;
}

function capStream(s: string): { value: string; truncated: boolean; omitted: number } {
  if (s.length <= STREAM_CAP) {
    return { value: s, truncated: false, omitted: 0 };
  }
  const kept = s.slice(0, STREAM_CAP);
  const omitted = s.length - STREAM_CAP;
  return {
    value: `${kept}\n...(truncated, ${omitted} bytes omitted)`,
    truncated: true,
    omitted,
  };
}

function formatResult(details: BashToolDetails): string {
  const parts: string[] = [];
  parts.push(`$ ${describeCommand(details)}`);
  parts.push(`exit: ${details.exitCode}`);
  if (details.stdout) {
    parts.push('--- stdout ---');
    parts.push(details.stdout.replace(/\n$/, ''));
  }
  if (details.stderr) {
    parts.push('--- stderr ---');
    parts.push(details.stderr.replace(/\n$/, ''));
  }
  if (!details.stdout && !details.stderr) {
    parts.push('(no output)');
  }
  return parts.join('\n');
}

function describeCommand(details: BashToolDetails): string {
  return `cwd=${details.cwd}`;
}

const BashParamsSchema = Type.Object({
  command: Type.String({
    description: 'The bash command or script to execute.',
  }),
  cwd: Type.Optional(
    Type.String({
      description: `Working directory. Must be an absolute path inside the mounted /vault tree. Defaults to ${VAULT_MOUNT}.`,
    })
  ),
});

export function createBashTool(): AgentTool<typeof BashParamsSchema, BashToolDetails> {
  return {
    name: 'bash',
    label: 'bash',
    description: [
      `Run a bash command against the mounted ${VAULT_MOUNT} filesystem and return`,
      'the command stdout, stderr, and exit code. Supports pipelines, redirections,',
      'control flow, and the full standard POSIX toolchain (ls, cat, grep, sed, awk,',
      'find, jq, etc.). Each call starts in a fresh shell at cwd=/vault — cd/export/',
      'aliases do not persist across calls.',
    ].join(' '),
    parameters: BashParamsSchema,
    execute: async (
      _toolCallId: string,
      params: BashParams,
      signal?: AbortSignal
    ): Promise<AgentToolResult<BashToolDetails>> => {
      const cwd = params.cwd?.trim() || VAULT_MOUNT;
      const fs = createZenFsBackedIFileSystem();
      const bash = new Bash({
        fs,
        cwd,
      });

      const startedAt = Date.now();
      const result = await bash.exec(params.command, { signal });
      const durationMs = Date.now() - startedAt;

      const stdoutCap = capStream(result.stdout ?? '');
      const stderrCap = capStream(result.stderr ?? '');

      const details: BashToolDetails = {
        stdout: stdoutCap.value,
        stderr: stderrCap.value,
        exitCode: result.exitCode,
        cwd,
        stdoutTruncated: stdoutCap.truncated,
        stderrTruncated: stderrCap.truncated,
        durationMs,
      };

      const text = formatResult(details);
      return {
        content: [{ type: 'text', text }],
        details,
      };
    },
  };
}
