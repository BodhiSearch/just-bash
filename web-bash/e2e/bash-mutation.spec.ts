import { test, expect } from '@playwright/test';
import { installVault } from './helpers/install-vault';
import { BashChatPage } from './pages/BashChatPage';
import { FileBrowserPage } from './pages/FileBrowserPage';
import { FULL_MODEL_ID, getTestState } from './tests/global-setup';

test.describe('just-bash write / mutation over /vault', () => {
  test('exercises mkdir/rmdir/rm/cp/mv/touch/chmod/tee/ln and redirections', async ({ page }) => {
    test.setTimeout(360_000);
    const { username, password, bodhiServerUrl } = getTestState();

    await installVault(page, 'bash-mutation');
    await page.goto('/');

    const chat = new BashChatPage(page);
    const fs = new FileBrowserPage(page);
    await chat.waitServerReady(bodhiServerUrl);
    await fs.waitVaultReady();
    await chat.login({ username, password });
    await chat.loadModels();
    await chat.selectModel(FULL_MODEL_ID);
    await chat.enableBashTool();

    // Turn 0: mkdir -p makes nested dirs.
    const mkResult = await chat.runBash(0, 'mkdir -p /vault/work/nested && ls /vault/work');
    expect(mkResult.exitCode).toBe(0);
    expect(mkResult.stdout).toContain('nested');

    // Turn 1: touch creates an empty file.
    const touchResult = await chat.runBash(1, 'touch /vault/work/a.txt && stat /vault/work/a.txt');
    expect(touchResult.exitCode).toBe(0);
    expect(touchResult.stdout).toContain('a.txt');

    // Turn 2: > redirection writes; >> appends. Verify content via ZenFS hook.
    const writeResult = await chat.runBash(
      2,
      'echo hi > /vault/work/a.txt && echo world >> /vault/work/a.txt && cat /vault/work/a.txt'
    );
    expect(writeResult.exitCode).toBe(0);
    expect(writeResult.stdout).toContain('hi');
    expect(writeResult.stdout).toContain('world');
    const aContents = await fs.readVirtualFile('/vault/work/a.txt');
    expect(aContents).toBe('hi\nworld\n');

    // Turn 3: < redirection feeds a file into stdin; wc -w should see 6 tokens.
    const stdinResult = await chat.runBash(3, 'wc -w < /vault/input.txt');
    expect(stdinResult.exitCode).toBe(0);
    expect(stdinResult.stdout).toMatch(/\b5\b/);

    // Turn 4: cp copies a file; mv renames it.
    const cpResult = await chat.runBash(
      4,
      'cp /vault/input.txt /vault/work/copy.txt && mv /vault/work/copy.txt /vault/work/renamed.txt && ls /vault/work'
    );
    expect(cpResult.exitCode).toBe(0);
    expect(cpResult.stdout).toContain('renamed.txt');
    expect(cpResult.stdout).not.toContain('copy.txt');
    const renamed = await fs.readVirtualFile('/vault/work/renamed.txt');
    expect(renamed).toContain('seed content for bash-mutation phase');

    // Turn 5: rm deletes the renamed file.
    const rmResult = await chat.runBash(5, 'rm /vault/work/renamed.txt && ls /vault/work');
    expect(rmResult.exitCode).toBe(0);
    expect(rmResult.stdout).not.toContain('renamed.txt');

    // Turn 6: rmdir clears the nested empty directory.
    const rmdirResult = await chat.runBash(6, 'rmdir /vault/work/nested && ls /vault/work');
    expect(rmdirResult.exitCode).toBe(0);
    expect(rmdirResult.stdout).not.toContain('nested');

    // Turn 7: chmod changes permission bits; stat reports back.
    const chmodResult = await chat.runBash(
      7,
      'chmod 755 /vault/work/a.txt && stat /vault/work/a.txt'
    );
    expect(chmodResult.exitCode).toBe(0);

    // Turn 8: tee splits stdout into a file while echoing.
    const teeResult = await chat.runBash(8, 'echo teed-line | tee /vault/work/teed.txt');
    expect(teeResult.exitCode).toBe(0);
    expect(teeResult.stdout).toContain('teed-line');
    const teed = await fs.readVirtualFile('/vault/work/teed.txt');
    expect(teed).toContain('teed-line');

    // Turn 9: ln -s creates a symlink; readlink shows the target.
    const lnResult = await chat.runBash(
      9,
      'ln -s /vault/input.txt /vault/work/input.link && readlink /vault/work/input.link'
    );
    expect(lnResult.exitCode).toBe(0);
    expect(lnResult.stdout).toContain('/vault/input.txt');
  });
});
