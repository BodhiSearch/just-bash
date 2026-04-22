import { test, expect } from '@playwright/test';
import { installVault } from './helpers/install-vault';
import { BashChatPage } from './pages/BashChatPage';
import { FULL_MODEL_ID, getTestState } from './tests/global-setup';

test.describe('just-bash interpreter grammar', () => {
  test('exercises pipelines, &&/||, $(...), vars, export, $?, globs, brace expansion, quoting', async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const { username, password, bodhiServerUrl } = getTestState();

    await installVault(page, 'bash-grammar');
    await page.goto('/');

    const chat = new BashChatPage(page);
    await chat.waitServerReady(bodhiServerUrl);
    await chat.login({ username, password });
    await chat.loadModels();
    await chat.selectModel(FULL_MODEL_ID);
    await chat.enableBashTool();

    // Pipelines.
    const pipe = await chat.runBash(0, 'ls /vault | wc -l');
    expect(pipe.exitCode).toBe(0);
    expect(pipe.stdout.trim()).toMatch(/\b3\b/);

    // && short-circuits on success; || does not run.
    const andOr1 = await chat.runBash(1, 'true && echo yes || echo no');
    expect(andOr1.exitCode).toBe(0);
    expect(andOr1.stdout.trim()).toBe('yes');

    // false → && skipped, || runs.
    const andOr2 = await chat.runBash(2, 'false && echo yes || echo no');
    expect(andOr2.exitCode).toBe(0);
    expect(andOr2.stdout.trim()).toBe('no');

    // Subshell grouping (...).
    const sub = await chat.runBash(
      3,
      '(cd /vault/nums && ls) | sort'
    );
    expect(sub.exitCode).toBe(0);
    expect(sub.stdout).toContain('01.txt');
    expect(sub.stdout).toContain('02.txt');
    expect(sub.stdout).toContain('03.txt');

    // $(...) command substitution.
    const substitution = await chat.runBash(
      4,
      'echo "count=$(ls /vault/nums | wc -l | tr -d \' \')"'
    );
    expect(substitution.exitCode).toBe(0);
    expect(substitution.stdout).toContain('count=3');

    // Variable assignment + expansion.
    const vars = await chat.runBash(5, 'X=42; echo "x is $X"');
    expect(vars.exitCode).toBe(0);
    expect(vars.stdout).toContain('x is 42');

    // export sets an env var visible to child processes.
    const exp = await chat.runBash(6, 'export MY_VAR=hello; env | grep MY_VAR');
    expect(exp.exitCode).toBe(0);
    expect(exp.stdout).toContain('MY_VAR=hello');

    // $? reflects the previous exit status.
    const exit = await chat.runBash(7, 'false; echo "rc=$?"');
    expect(exit.exitCode).toBe(0);
    expect(exit.stdout).toContain('rc=1');

    // Glob *.md in /vault.
    const glob = await chat.runBash(8, 'ls /vault/*.md');
    expect(glob.exitCode).toBe(0);
    expect(glob.stdout).toContain('README.md');
    expect(glob.stdout).toContain('notes.md');

    // Glob ? (single-char) — echo expands to space-separated matches.
    const globQ = await chat.runBash(9, 'echo /vault/nums/0?.txt');
    expect(globQ.exitCode).toBe(0);
    expect(globQ.stdout).toContain('/vault/nums/01.txt');
    expect(globQ.stdout).toContain('/vault/nums/02.txt');
    expect(globQ.stdout).toContain('/vault/nums/03.txt');

    // Brace expansion.
    const brace = await chat.runBash(10, 'echo {a,b,c}.txt');
    expect(brace.exitCode).toBe(0);
    expect(brace.stdout.trim()).toBe('a.txt b.txt c.txt');

    // Double quoting preserves variable expansion; single quoting does not.
    const quoting = await chat.runBash(11, "X=42; echo \"double=$X\"; echo 'single=$X'");
    expect(quoting.exitCode).toBe(0);
    expect(quoting.stdout).toContain('double=42');
    expect(quoting.stdout).toContain('single=$X');
  });
});
