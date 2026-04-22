import { test, expect } from '@playwright/test';
import { installVault } from './helpers/install-vault';
import { BashChatPage } from './pages/BashChatPage';
import { FULL_MODEL_ID, getTestState } from './tests/global-setup';

test.describe('just-bash read-only FS over /vault', () => {
  test('exercises ls, cat, head, tail, wc, stat, pwd, find, tree', async ({ page }) => {
    test.setTimeout(240_000);
    const { username, password, bodhiServerUrl } = getTestState();

    await installVault(page, 'sample-project');
    await page.goto('/');

    const chat = new BashChatPage(page);
    await chat.waitServerReady(bodhiServerUrl);
    await chat.login({ username, password });
    await chat.loadModels();
    await chat.selectModel(FULL_MODEL_ID);
    await chat.enableBashTool();

    // Turn 0: ls /vault — every seeded top-level entry visible.
    const lsResult = await chat.runBash(0, 'ls /vault');
    expect(lsResult.exitCode).toBe(0);
    expect(lsResult.stdout).toContain('README.md');
    expect(lsResult.stdout).toContain('notes');
    expect(lsResult.stdout).toContain('src');
    expect(lsResult.stdout).toContain('logo.bin');
    const lsReply = await chat.getAssistantReply(0);
    expect(lsReply.toLowerCase()).toMatch(/readme|notes|src|logo/);

    // Turn 1: cat /vault/README.md — full text round-trip.
    const catResult = await chat.runBash(1, 'cat /vault/README.md');
    expect(catResult.exitCode).toBe(0);
    expect(catResult.stdout).toContain('# sample-project');
    expect(catResult.stdout).toContain('A tiny fixture used by web-bash');

    // Turn 2: head -n 1 /vault/README.md → just the title line.
    const headResult = await chat.runBash(2, 'head -n 1 /vault/README.md');
    expect(headResult.exitCode).toBe(0);
    expect(headResult.stdout).toContain('# sample-project');
    expect(headResult.stdout).not.toContain('A tiny fixture');

    // Turn 3: tail -n 1 /vault/notes/todo.md → the last bullet.
    const tailResult = await chat.runBash(3, 'tail -n 1 /vault/notes/todo.md');
    expect(tailResult.exitCode).toBe(0);
    expect(tailResult.stdout).toContain('keep Playwright suite green');

    // Turn 4: wc -l /vault/notes/todo.md → 5-line count.
    const wcResult = await chat.runBash(4, 'wc -l /vault/notes/todo.md');
    expect(wcResult.exitCode).toBe(0);
    expect(wcResult.stdout).toMatch(/\b5\b/);

    // Turn 5: stat /vault/README.md → reports as a regular file.
    const statResult = await chat.runBash(5, 'stat /vault/README.md');
    expect(statResult.exitCode).toBe(0);
    expect(statResult.stdout.toLowerCase()).toContain('readme.md');

    // Turn 6: pwd in a subshell with cd → /vault is default cwd.
    const pwdResult = await chat.runBash(6, 'pwd');
    expect(pwdResult.exitCode).toBe(0);
    expect(pwdResult.stdout.trim()).toBe('/vault');

    // Turn 7: find /vault -name '*.md' → README + todo listed.
    const findResult = await chat.runBash(7, "find /vault -name '*.md'");
    expect(findResult.exitCode).toBe(0);
    expect(findResult.stdout).toContain('/vault/README.md');
    expect(findResult.stdout).toContain('/vault/notes/todo.md');

    // Turn 8: tree /vault → hierarchical listing.
    const treeResult = await chat.runBash(8, 'tree /vault');
    expect(treeResult.exitCode).toBe(0);
    expect(treeResult.stdout).toContain('/vault');
    expect(treeResult.stdout).toContain('README.md');
    expect(treeResult.stdout).toContain('notes');
    expect(treeResult.stdout).toContain('todo.md');
  });
});
