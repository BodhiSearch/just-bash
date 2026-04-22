import { test, expect } from '@playwright/test';
import { installVault } from './helpers/install-vault';
import { BashChatPage } from './pages/BashChatPage';
import { FileBrowserPage } from './pages/FileBrowserPage';
import { FULL_MODEL_ID, getTestState } from './tests/global-setup';

/**
 * Phase 6 exercises the miscellaneous just-bash utilities that don't
 * fit the FS/text/mutation/grammar/control-flow buckets, plus the
 * documented gzip/gunzip/zcat failure shape in the browser bundle
 * (node:zlib is shimmed to throw when its functions are invoked).
 *
 * Commands are driven through window.__bashExec so deterministic,
 * multi-line-friendly assertions run without LLM-tool-call drift.
 * A final smoke case routes a simple utility call through the full
 * chat/agent loop so the LLM-integration path stays covered.
 */
test.describe('just-bash misc utilities over /vault', () => {
  test('base64/checksums/date/seq/printf/env/which/timeout/xargs/etc. plus gzip failure shape', async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const { username, password, bodhiServerUrl } = getTestState();

    await installVault(page, 'bash-misc');
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

    // seq produces the inclusive range on stdout.
    const seqR = await chat.runBashDirect('seq 1 3');
    expect(seqR.exitCode).toBe(0);
    expect(seqR.stdout.replace(/\s+/g, ' ').trim()).toBe('1 2 3');

    // printf formats arguments per the format string.
    const printfR = await chat.runBashDirect("printf '%s-%s\\n' a b");
    expect(printfR.exitCode).toBe(0);
    expect(printfR.stdout.trim()).toBe('a-b');

    // true returns 0, false returns non-zero.
    const trueR = await chat.runBashDirect('true');
    expect(trueR.exitCode).toBe(0);
    const falseR = await chat.runBashDirect('false');
    expect(falseR.exitCode).not.toBe(0);

    // basename strips directory components.
    const baseR = await chat.runBashDirect('basename /vault/hello.txt');
    expect(baseR.exitCode).toBe(0);
    expect(baseR.stdout.trim()).toBe('hello.txt');

    // dirname strips the trailing component.
    const dirR = await chat.runBashDirect('dirname /vault/hello.txt');
    expect(dirR.exitCode).toBe(0);
    expect(dirR.stdout.trim()).toBe('/vault');

    // expr performs integer arithmetic.
    const exprR = await chat.runBashDirect('expr 6 \\* 7');
    expect(exprR.exitCode).toBe(0);
    expect(exprR.stdout.trim()).toBe('42');

    // tac reverses input lines.
    const tacR = await chat.runBashDirect('tac /vault/hello.txt');
    expect(tacR.exitCode).toBe(0);
    const tacLines = tacR.stdout.trim().split('\n');
    expect(tacLines[0]).toBe('line');
    expect(tacLines[tacLines.length - 1]).toBe('hello');

    // date with a format prints the current year.
    const dateR = await chat.runBashDirect('date +%Y');
    expect(dateR.exitCode).toBe(0);
    expect(dateR.stdout.trim()).toMatch(/^\d{4}$/);

    // md5sum of "hello\n" is a stable, well-known digest.
    const md5R = await chat.runBashDirect('echo hello | md5sum');
    expect(md5R.exitCode).toBe(0);
    expect(md5R.stdout).toContain('b1946ac92492d2347c6235b4d2611184');

    // sha1sum of "hello\n" is stable.
    const sha1R = await chat.runBashDirect('echo hello | sha1sum');
    expect(sha1R.exitCode).toBe(0);
    expect(sha1R.stdout).toContain('f572d396fae9206628714fb2ce00f72e94f2258f');

    // sha256sum of "hello\n" is stable.
    const sha256R = await chat.runBashDirect('echo hello | sha256sum');
    expect(sha256R.exitCode).toBe(0);
    expect(sha256R.stdout).toContain(
      '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03'
    );

    // base64 round-trip via pipelines ("hi\n" -> aGkK -> hi).
    const b64Enc = await chat.runBashDirect('echo hi | base64');
    expect(b64Enc.exitCode).toBe(0);
    expect(b64Enc.stdout.trim()).toBe('aGkK');
    const b64Dec = await chat.runBashDirect('echo hi | base64 | base64 -d');
    expect(b64Dec.exitCode).toBe(0);
    expect(b64Dec.stdout.trim()).toBe('hi');

    // env lists PATH among exported variables.
    const envR = await chat.runBashDirect('env');
    expect(envR.exitCode).toBe(0);
    expect(envR.stdout).toMatch(/PATH=/);

    // printenv extracts a single variable.
    const printenvR = await chat.runBashDirect('FOO=bar printenv FOO');
    expect(printenvR.exitCode).toBe(0);
    expect(printenvR.stdout.trim()).toBe('bar');

    // which returns non-zero for a missing command. The browser bundle
    // doesn't seed /bin stubs via the ZenFS adapter (writeFileSync
    // isn't exposed), so this asserts the documented not-found shape
    // rather than a successful lookup.
    const whichR = await chat.runBashDirect('which definitely-not-a-real-cmd-xyz');
    expect(whichR.exitCode).not.toBe(0);

    // sleep completes (short duration keeps the test fast).
    const sleepR = await chat.runBashDirect('sleep 0');
    expect(sleepR.exitCode).toBe(0);

    // timeout kills a long sleep; POSIX exit convention returns 124 on timeout.
    const timeoutR = await chat.runBashDirect('timeout 1 sleep 5');
    expect(timeoutR.exitCode).not.toBe(0);

    // xargs -n 1 echo splits space-separated words onto separate lines.
    const xargsR = await chat.runBashDirect('echo a b c | xargs -n 1 echo');
    expect(xargsR.exitCode).toBe(0);
    expect(xargsR.stdout.trim().split('\n')).toEqual(['a', 'b', 'c']);

    // hostname prints a non-empty identifier in the browser bundle.
    const hostR = await chat.runBashDirect('hostname');
    expect(hostR.exitCode).toBe(0);
    expect(hostR.stdout.trim().length).toBeGreaterThan(0);

    // whoami prints a non-empty user identifier.
    const whoR = await chat.runBashDirect('whoami');
    expect(whoR.exitCode).toBe(0);
    expect(whoR.stdout.trim().length).toBeGreaterThan(0);

    // od dumps sample bytes; "abc\n" begins with 141 142 143 in octal.
    const odR = await chat.runBashDirect('od -c /vault/sample.txt');
    expect(odR.exitCode).toBe(0);
    expect(odR.stdout).toMatch(/a\s+b\s+c/);

    // file reports a plausible type for a text file.
    const fileR = await chat.runBashDirect('file /vault/hello.txt');
    expect(fileR.exitCode).toBe(0);
    expect(fileR.stdout.toLowerCase()).toContain('text');

    // html-to-markdown converts a small HTML document.
    const htmlR = await chat.runBashDirect('html-to-markdown /vault/page.html');
    expect(htmlR.exitCode).toBe(0);
    expect(htmlR.stdout).toContain('Title');
    expect(htmlR.stdout).toContain('world');

    // time runs a command and emits timing information on stderr.
    const timeR = await chat.runBashDirect('time true');
    expect(timeR.exitCode).toBe(0);
    expect((timeR.stdout + timeR.stderr).toLowerCase()).toMatch(/real|user|sys|ms|m[0-9]/);

    // gzip family must fail gracefully in the browser (node:zlib is
    // shimmed to throw on invocation); we assert the error shape, not
    // a successful round-trip.
    const gzipR = await chat.runBashDirect('gzip /vault/hello.txt');
    expect(gzipR.exitCode).not.toBe(0);
    expect(gzipR.stderr.length).toBeGreaterThan(0);

    const gunzipR = await chat.runBashDirect('gunzip /vault/hello.txt.gz');
    expect(gunzipR.exitCode).not.toBe(0);
    expect(gunzipR.stderr.length).toBeGreaterThan(0);

    const zcatR = await chat.runBashDirect('zcat /vault/hello.txt.gz');
    expect(zcatR.exitCode).not.toBe(0);
    expect(zcatR.stderr.length).toBeGreaterThan(0);

    // Smoke: one end-to-end chat turn through the LLM also still
    // reaches the bash tool (guards the full agent loop for this phase).
    await chat.login({ username, password });
    await chat.loadModels();
    await chat.selectModel(FULL_MODEL_ID);
    await chat.enableBashTool();
    const smoke = await chat.runBash(0, 'seq 1 3');
    expect(smoke.exitCode).toBe(0);
    expect(smoke.stdout.replace(/\s+/g, ' ').trim()).toContain('1 2 3');
  });
});
