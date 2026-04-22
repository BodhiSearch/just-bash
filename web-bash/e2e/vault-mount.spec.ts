import { test, expect } from '@playwright/test';
import { installVault } from './helpers/install-vault';
import { FileBrowserPage } from './pages/FileBrowserPage';
import { ChatPage } from './tests/pages/ChatPage';
import { getTestState } from './tests/global-setup';

test.describe('Vault mount (in-memory seed)', () => {
  test('seeds a vault, lists files, switches viewer between them', async ({ page }) => {
    const { bodhiServerUrl } = getTestState();
    await installVault(page, 'sample-project');
    await page.goto('/');

    // Dismiss the Bodhi setup overlay so the three-column UI is clickable.
    // This walks the setup modal but does not log the user in — pure FS
    // assertions don't depend on authentication.
    const chat = new ChatPage(page);
    await chat.waitServerReady(bodhiServerUrl);

    const fs = new FileBrowserPage(page);

    // Mount + sidebar populate.
    await fs.waitSidebarLoaded();
    await fs.waitVaultReady();
    expect(await fs.dirName()).toBe('sample-project');

    // Seeded entries are visible.
    await expect(fs.treeNode('README.md')).toBeVisible();
    await expect(fs.treeNode('notes')).toBeVisible();
    await expect(fs.treeNode('src')).toBeVisible();
    await expect(fs.treeNode('logo.bin')).toBeVisible();

    // Viewer starts empty.
    await fs.expectViewerState('empty');

    // Expand notes/ and open todo.md.
    await fs.toggleDir('notes');
    await expect(fs.treeNode('notes/todo.md')).toBeVisible();
    await fs.openFile('notes/todo.md');
    await fs.expectViewerState('loaded');
    expect(await fs.viewerText()).toContain('wire just-bash browser entrypoint');
    await expect(page.locator('[data-testid="nav-viewer-breadcrumb"]')).toContainText('todo.md');

    // Switch to README.md.
    await fs.openFile('README.md');
    await fs.expectViewerState('loaded');
    expect(await fs.viewerText()).toContain('# sample-project');

    // Binary file surfaces unsupported state.
    await fs.openFile('logo.bin');
    await fs.expectViewerState('unsupported');
    await expect(page.locator('[data-testid="p-viewer-unsupported"]')).toBeVisible();

    // Sanity-check the ZenFS test hook reads back the same fixture content.
    const rawReadme = await fs.readVirtualFile('/vault/README.md');
    expect(rawReadme).toContain('# sample-project');
  });
});
