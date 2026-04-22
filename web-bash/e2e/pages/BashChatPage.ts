/**
 * BashChatPage — Playwright page object for bash-tool e2e specs.
 *
 * Extends ChatPage with helpers that:
 *  - ensure the bash tool is enabled in the MCP popover
 *  - ask the model to run a given shell command via the chat flow
 *  - read the structured tool-call result rendered inside ToolCallMessage
 *  - expose handy assertion primitives over the parsed tool result text
 */

import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { ChatPage } from '../tests/pages/ChatPage';

export interface BashToolResult {
  raw: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function parseBashResult(raw: string): BashToolResult {
  const exitMatch = raw.match(/\nexit:\s+(-?\d+)\n/);
  const exitCode = exitMatch ? Number(exitMatch[1]) : null;

  let stdout = '';
  let stderr = '';
  const stdoutMatch = raw.match(/--- stdout ---\n([\s\S]*?)(?=\n--- stderr ---|\s*$)/);
  if (stdoutMatch) stdout = stdoutMatch[1];
  const stderrMatch = raw.match(/--- stderr ---\n([\s\S]*?)\s*$/);
  if (stderrMatch) stderr = stderrMatch[1];

  return { raw, exitCode, stdout, stderr };
}

export class BashChatPage extends ChatPage {
  bashSelectors = {
    popoverTrigger: '[data-testid="mcps-popover-trigger"]',
    popoverContent: '[data-testid="mcps-popover-content"]',
    bashRow: '[data-testid="bash-tool-row"]',
    bashCheckbox: '[data-testid="checkbox-bash-tool"]',
    toolCallMessage: '[data-testid="tool-call-message"]',
    toolCallItem: '[data-testid="tool-call-item"]',
    toolCallExpand: '[data-testid="tool-call-expand"]',
    toolCallContent: '[data-testid="tool-call-content"]',
    toolCallStatus: '[data-testid="tool-call-status"]',
    toolCallResultRaw: '[data-testid="tool-call-result-raw"]',
    bashToolItem: '[data-testid="tool-call-item"][data-tool-name="bash"]',
  };

  /**
   * Ensure the bash AgentTool is included in the call set. Default is "on"
   * because useBashTool persists true on first run.
   */
  async enableBashTool(): Promise<void> {
    await this.page.locator(this.bashSelectors.popoverTrigger).click();
    await this.page.locator(this.bashSelectors.popoverContent).waitFor();
    const row = this.page.locator(this.bashSelectors.bashRow);
    await row.waitFor();
    const state = await row.getAttribute('data-test-state');
    if (state !== 'enabled') {
      await this.page.locator(this.bashSelectors.bashCheckbox).click();
      await expect(row).toHaveAttribute('data-test-state', 'enabled');
    }
    await this.page.keyboard.press('Escape');
    await this.page.locator(this.bashSelectors.popoverContent).waitFor({ state: 'hidden' });
  }

  /**
   * Ask the model to run a bash command, wait for the tool call to complete,
   * and return the parsed result.
   */
  async runBash(turn: number, command: string): Promise<BashToolResult> {
    const prompt =
      `Use the bash tool to run exactly this command and then reply with a brief ` +
      `plain-text summary of what it printed. Do not modify the command. ` +
      `Command:\n\n\`\`\`\n${command}\n\`\`\``;
    await this.send(prompt);
    await this.waitForTurnSettled(turn);
    return await this.getLastToolResult();
  }

  /**
   * Wait until the current turn's tool call completes and the model finishes
   * its final response. Tolerant of multiple assistant bubbles per turn
   * (preamble + final reply).
   */
  async waitForTurnSettled(turn: number): Promise<void> {
    const statuses = this.page.locator(
      `${this.bashSelectors.toolCallMessage} ${this.bashSelectors.toolCallStatus}`
    );
    await expect
      .poll(
        async () => {
          const count = await statuses.count();
          if (count === 0) return null;
          return await statuses.nth(count - 1).textContent();
        },
        { timeout: 120_000, intervals: [500, 1000, 2000] }
      )
      .toBe('completed');

    const assistantBubbles = this.page.locator(this.selectors.message(turn, 'assistant'));
    await expect
      .poll(() => assistantBubbles.count(), {
        timeout: 120_000,
        intervals: [500, 1000, 2000],
      })
      .toBeGreaterThan(0);

    await this.page.locator(this.selectors.chatProcessing).waitFor({ state: 'hidden' });
  }

  /**
   * Return concatenated text of all assistant bubbles for a given turn,
   * tolerant of models that emit preamble text before calling tools.
   */
  async getAssistantReply(turn: number): Promise<string> {
    const bubbles = this.page.locator(this.selectors.message(turn, 'assistant'));
    const count = await bubbles.count();
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      parts.push((await bubbles.nth(i).textContent()) ?? '');
    }
    return parts.join('\n');
  }

  async getLastToolResult(): Promise<BashToolResult> {
    const items = this.page.locator(this.bashSelectors.bashToolItem);
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    const last = items.nth(count - 1);
    await expect(last).toHaveAttribute('data-teststate', 'completed');
    return await this.readToolResult(last);
  }

  private async readToolResult(toolCallItem: Locator): Promise<BashToolResult> {
    const raw = await toolCallItem
      .locator(this.bashSelectors.toolCallResultRaw)
      .first()
      .textContent();
    return parseBashResult(raw ?? '');
  }
}
