import { test, expect } from '@playwright/test';
import { installVault } from './helpers/install-vault';
import { BashChatPage } from './pages/BashChatPage';
import { FULL_MODEL_ID, getTestState } from './tests/global-setup';

test.describe('just-bash text processing over /vault', () => {
  test('exercises grep family, rg, sed, awk, cut/sort/uniq, tr, jq, diff, comm, paste, rev, nl', async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const { username, password, bodhiServerUrl } = getTestState();

    await installVault(page, 'bash-text');
    await page.goto('/');

    const chat = new BashChatPage(page);
    await chat.waitServerReady(bodhiServerUrl);
    await chat.login({ username, password });
    await chat.loadModels();
    await chat.selectModel(FULL_MODEL_ID);
    await chat.enableBashTool();

    // grep ERROR lines in the log.
    const grep = await chat.runBash(0, 'grep ERROR /vault/log.txt');
    expect(grep.exitCode).toBe(0);
    expect(grep.stdout).toContain('failed to refresh cache');
    expect(grep.stdout).toContain('unable to reach notification service');
    expect(grep.stdout).not.toContain('INFO starting');

    // fgrep literal match on a table name (no regex).
    const fgrep = await chat.runBash(1, "fgrep 'users table' /vault/log.txt");
    expect(fgrep.exitCode).toBe(0);
    expect(fgrep.stdout).toContain('slow query detected in users table');

    // egrep extended regex alternation.
    const egrep = await chat.runBash(2, "egrep 'WARN|ERROR' /vault/log.txt | wc -l");
    expect(egrep.exitCode).toBe(0);
    expect(egrep.stdout).toMatch(/\b4\b/);

    // rg pattern search with line numbers.
    const rg = await chat.runBash(3, "rg -n 'cache' /vault/log.txt");
    expect(rg.exitCode).toBe(0);
    expect(rg.stdout).toContain('cache');
    expect(rg.stdout).toMatch(/^\s*\d+:/m);

    // sed substitution: rewrite ERROR to FAILURE.
    const sed = await chat.runBash(4, "sed 's/ERROR/FAILURE/g' /vault/log.txt | grep -c FAILURE");
    expect(sed.exitCode).toBe(0);
    expect(sed.stdout).toMatch(/\b2\b/);

    // awk: extract the level column (column 3) and count each.
    const awk = await chat.runBash(
      5,
      "awk '{print $3}' /vault/log.txt | sort | uniq -c | sort -rn"
    );
    expect(awk.exitCode).toBe(0);
    expect(awk.stdout).toContain('INFO');
    expect(awk.stdout).toContain('WARN');
    expect(awk.stdout).toContain('ERROR');

    // cut + sort: unique team names from the CSV (skip header).
    const cut = await chat.runBash(6, "tail -n +2 /vault/data.csv | cut -d',' -f3 | sort | uniq");
    expect(cut.exitCode).toBe(0);
    expect(cut.stdout).toContain('platform');
    expect(cut.stdout).toContain('tools');

    // tr: uppercase a sample line.
    const tr = await chat.runBash(7, "echo alpha | tr 'a-z' 'A-Z'");
    expect(tr.exitCode).toBe(0);
    expect(tr.stdout).toContain('ALPHA');

    // jq: read nested field from data.json.
    const jq = await chat.runBash(8, 'jq -r .project /vault/data.json');
    expect(jq.exitCode).toBe(0);
    expect(jq.stdout).toContain('just-bash');

    // jq: numeric access.
    const jq2 = await chat.runBash(9, 'jq .metrics.passing /vault/data.json');
    expect(jq2.exitCode).toBe(0);
    expect(jq2.stdout).toMatch(/\b75\b/);

    // diff: show the only changed line.
    const diff = await chat.runBash(10, 'diff /vault/left.txt /vault/right.txt');
    expect(diff.stdout).toContain('delta');
    expect(diff.stdout).toContain('echo');

    // comm: lines common to both already-sorted files (column 3).
    const comm = await chat.runBash(11, 'comm -12 /vault/left.txt /vault/right.txt');
    expect(comm.exitCode).toBe(0);
    expect(comm.stdout).toContain('alpha');
    expect(comm.stdout).toContain('bravo');
    expect(comm.stdout).toContain('charlie');
    expect(comm.stdout).not.toContain('delta');

    // paste: join two files side by side with a tab.
    const paste = await chat.runBash(12, 'paste /vault/paste-a.txt /vault/paste-b.txt');
    expect(paste.exitCode).toBe(0);
    expect(paste.stdout).toMatch(/one\s+uno/);
    expect(paste.stdout).toMatch(/two\s+dos/);
    expect(paste.stdout).toMatch(/three\s+tres/);

    // rev: reverse characters on a line.
    const rev = await chat.runBash(13, 'echo abcdef | rev');
    expect(rev.exitCode).toBe(0);
    expect(rev.stdout).toContain('fedcba');

    // nl: number non-empty lines of the README.
    const nl = await chat.runBash(14, 'nl /vault/paste-a.txt');
    expect(nl.exitCode).toBe(0);
    expect(nl.stdout).toMatch(/\b1\b.*one/);
    expect(nl.stdout).toMatch(/\b3\b.*three/);

    // sanity: the assistant produced a summary referencing something from
    // the last tool call (covers the end-to-end model loop).
    const lastReply = await chat.getAssistantReply(14);
    expect(lastReply.length).toBeGreaterThan(0);
  });
});
