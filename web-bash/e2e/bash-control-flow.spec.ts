import { test, expect } from '@playwright/test';
import { installVault } from './helpers/install-vault';
import { BashChatPage } from './pages/BashChatPage';
import { FileBrowserPage } from './pages/FileBrowserPage';
import { FULL_MODEL_ID, getTestState } from './tests/global-setup';

/**
 * Phase 5 stresses the just-bash interpreter (control flow + multi-line
 * commands + heredocs). These scripts embed literal newlines that the LLM
 * tool-call layer would mangle, so they're executed directly against the
 * bash AgentTool via the dev-only window.__bashExec hook (same Bash +
 * IFileSystem wiring the chat agent uses). A final smoke case still drives
 * a simple one-liner through the full chat flow so the LLM-integration path
 * stays covered for this phase.
 */
test.describe('just-bash control flow', () => {
  test('exercises if/for/while/case/functions, test/[/[[, arithmetic, heredocs', async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const { username, password, bodhiServerUrl } = getTestState();

    await installVault(page, 'bash-grammar');
    await page.goto('/');

    const chat = new BashChatPage(page);
    const fs = new FileBrowserPage(page);
    await chat.waitServerReady(bodhiServerUrl);
    await fs.waitVaultReady();

    await page.waitForFunction(
      () => typeof (window as unknown as { __bashExec?: unknown }).__bashExec === 'function',
      undefined,
      { timeout: 15_000 }
    );

    // if / fi covering -f test.
    const ifFi = await chat.runBashDirect(
      'if [ -f /vault/README.md ]; then echo FOUND; else echo MISSING; fi'
    );
    expect(ifFi.exitCode).toBe(0);
    expect(ifFi.stdout.trim()).toBe('FOUND');

    // if / elif / else with test builtin.
    const elseBranch = await chat.runBashDirect(
      'if test -d /vault/nums; then echo DIR; elif test -f /vault/nums; then echo FILE; else echo NEITHER; fi'
    );
    expect(elseBranch.exitCode).toBe(0);
    expect(elseBranch.stdout.trim()).toBe('DIR');

    // [[ ... ]] extended test with pattern matching.
    const extTest = await chat.runBashDirect(
      'name=README.md; if [[ $name == *.md ]]; then echo markdown; else echo other; fi'
    );
    expect(extTest.exitCode).toBe(0);
    expect(extTest.stdout.trim()).toBe('markdown');

    // [ "$a" = "$b" ] string equality via POSIX test.
    const strEq = await chat.runBashDirect(
      'a=x; b=x; if [ "$a" = "$b" ]; then echo equal; else echo diff; fi'
    );
    expect(strEq.exitCode).toBe(0);
    expect(strEq.stdout.trim()).toBe('equal');

    // for loop over a glob.
    const forLoop = await chat.runBashDirect(
      'for f in /vault/nums/*.txt; do basename "$f"; done | sort'
    );
    expect(forLoop.exitCode).toBe(0);
    expect(forLoop.stdout).toContain('01.txt');
    expect(forLoop.stdout).toContain('02.txt');
    expect(forLoop.stdout).toContain('03.txt');

    // while loop with arithmetic expansion.
    const whileLoop = await chat.runBashDirect(
      'n=0; while [ $n -lt 3 ]; do n=$((n+1)); done; echo $n'
    );
    expect(whileLoop.exitCode).toBe(0);
    expect(whileLoop.stdout.trim()).toBe('3');

    // until loop decrementing to the bound.
    const untilLoop = await chat.runBashDirect(
      'n=5; until [ $n -le 2 ]; do n=$((n-1)); done; echo $n'
    );
    expect(untilLoop.exitCode).toBe(0);
    expect(untilLoop.stdout.trim()).toBe('2');

    // case / esac.
    const caseStmt = await chat.runBashDirect('case foo in foo) echo ok;; *) echo no;; esac');
    expect(caseStmt.exitCode).toBe(0);
    expect(caseStmt.stdout.trim()).toBe('ok');

    // Function definition + call with a positional argument.
    const fn = await chat.runBashDirect('greet() { echo "hello $1"; }; greet world');
    expect(fn.exitCode).toBe(0);
    expect(fn.stdout.trim()).toBe('hello world');

    // (( ... )) arithmetic evaluation.
    const arith = await chat.runBashDirect('x=6; y=7; (( z = x * y )); echo $z');
    expect(arith.exitCode).toBe(0);
    expect(arith.stdout.trim()).toBe('42');

    // $((...)) arithmetic expansion.
    const arithExp = await chat.runBashDirect('echo $(( (2 + 3) * 4 ))');
    expect(arithExp.exitCode).toBe(0);
    expect(arithExp.stdout.trim()).toBe('20');

    // Heredoc <<'EOF' (no expansion of $nope).
    const heredoc = await chat.runBashDirect("cat <<'EOF'\nline one $nope\nline two\nEOF\n");
    expect(heredoc.exitCode).toBe(0);
    expect(heredoc.stdout).toContain('line one $nope');
    expect(heredoc.stdout).toContain('line two');

    // Heredoc <<EOF WITH expansion.
    const heredocExp = await chat.runBashDirect('who=world\ncat <<EOF\nhello $who\nEOF\n');
    expect(heredocExp.exitCode).toBe(0);
    expect(heredocExp.stdout).toContain('hello world');

    // Heredoc <<- strips leading tabs.
    const heredocTab = await chat.runBashDirect('cat <<-EOF\n\ttabbed\n\tmore\n\tEOF\n');
    expect(heredocTab.exitCode).toBe(0);
    expect(heredocTab.stdout).toContain('tabbed');
    expect(heredocTab.stdout).toContain('more');
    expect(heredocTab.stdout).not.toMatch(/^\t/m);

    // Here-string <<<.
    const hereString = await chat.runBashDirect('grep x <<<"xyz"');
    expect(hereString.exitCode).toBe(0);
    expect(hereString.stdout).toContain('xyz');

    // Smoke: one end-to-end chat turn through the LLM also still
    // reaches the bash tool (guards the full agent loop for this phase).
    await chat.login({ username, password });
    await chat.loadModels();
    await chat.selectModel(FULL_MODEL_ID);
    await chat.enableBashTool();
    const smoke = await chat.runBash(0, 'echo hello-from-phase5');
    expect(smoke.exitCode).toBe(0);
    expect(smoke.stdout).toContain('hello-from-phase5');
  });
});
