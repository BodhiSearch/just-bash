import { Page, Locator, expect } from '@playwright/test';

function sanitizePath(path: string): string {
  return path
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export class FileBrowserPage {
  constructor(private page: Page) {}

  selectors = {
    sidebar: '[data-testid="div-sidebar-container"]',
    sidebarLoaded: '[data-testid="div-sidebar-container"][data-test-state="loaded"]',
    dirName: '[data-testid="span-sidebar-dirname"]',
    vaultStatus: '[data-testid="span-vault-status"]',
    vaultReady: '[data-testid="span-vault-status"][data-test-state="ready"]',
    viewer: '[data-testid="div-viewer-container"]',
    viewerContent: '[data-testid="pre-viewer-content"]',
    viewerUnsupported: '[data-testid="p-viewer-unsupported"]',
    breadcrumb: '[data-testid="nav-viewer-breadcrumb"]',
    openDirectory: '[data-testid="btn-sidebar-open"]',
  };

  treeNode(path: string): Locator {
    return this.page.locator(`[data-testid="div-tree-${sanitizePath(path)}"]`);
  }

  toggleDirButton(path: string): Locator {
    return this.page.locator(`[data-testid="btn-tree-toggle-${sanitizePath(path)}"]`);
  }

  fileButton(path: string): Locator {
    return this.treeNode(path).locator('button').first();
  }

  async waitVaultReady(): Promise<void> {
    await this.page.locator(this.selectors.vaultReady).waitFor();
  }

  async waitSidebarLoaded(): Promise<void> {
    await this.page.locator(this.selectors.sidebarLoaded).waitFor();
  }

  async dirName(): Promise<string> {
    return (await this.page.locator(this.selectors.dirName).textContent()) ?? '';
  }

  async toggleDir(path: string): Promise<void> {
    await this.toggleDirButton(path).click();
  }

  async openFile(path: string): Promise<void> {
    await this.fileButton(path).click();
  }

  async viewerState(): Promise<string> {
    return (await this.page.locator(this.selectors.viewer).getAttribute('data-test-state')) ?? '';
  }

  async expectViewerState(state: 'empty' | 'loading' | 'loaded' | 'unsupported'): Promise<void> {
    await expect(this.page.locator(this.selectors.viewer)).toHaveAttribute(
      'data-test-state',
      state
    );
  }

  async viewerText(): Promise<string> {
    return (await this.page.locator(this.selectors.viewerContent).textContent()) ?? '';
  }

  async readVirtualFile(absPath: string): Promise<string> {
    return await this.page.evaluate(async p => {
      const fsHandle = (
        window as unknown as {
          __zenfsFs?: { readFile: (p: string, enc: string) => Promise<string> };
        }
      ).__zenfsFs;
      if (!fsHandle) throw new Error('window.__zenfsFs is not available');
      return await fsHandle.readFile(p, 'utf8');
    }, absPath);
  }
}
