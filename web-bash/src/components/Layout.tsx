import { useMemo } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDirectoryHandle } from '@/hooks/useDirectoryHandle';
import { useFileTree } from '@/hooks/useFileTree';
import { useVaultMount, type VaultMountPorts } from '@/hooks/useVaultMount';
import { useDevSeedBoot } from '@/hooks/useDevSeedBoot';
import { mountVault, unmountVault } from '@/adapters/zenfs-provider';
import { ZenFsProvider } from '@/adapters/zenfs-fs-provider';
import Header from './Header';
import AppSidebar from './AppSidebar';
import FileViewer from './FileViewer';
import ChatColumn from './ChatColumn';

export default function Layout() {
  const {
    status,
    handle: realHandle,
    restoring,
    openDirectory,
    restoreAccess,
    closeDirectory,
  } = useDirectoryHandle();

  const devSeed = useDevSeedBoot();
  const useSeed = devSeed.boot !== null;
  const handle = useSeed ? devSeed.boot!.handle : realHandle;

  const {
    nodes,
    expanded,
    selectedPath,
    selectedNode,
    fileContent,
    viewerState,
    toggleExpand,
    selectFile,
  } = useFileTree(handle);

  const realVaultPorts = useMemo<VaultMountPorts>(
    () => ({
      mount: mountVault,
      unmount: unmountVault,
      createProvider: (h: FileSystemDirectoryHandle) => new ZenFsProvider(h.name),
    }),
    []
  );
  const vaultPorts = useSeed ? devSeed.boot!.ports : realVaultPorts;
  const vault = useVaultMount(handle, vaultPorts);

  const rootDirName = handle?.name ?? null;
  const breadcrumbSegments = selectedNode
    ? ([rootDirName, ...selectedNode.path.split('/')].filter(Boolean) as string[])
    : [];

  // Sidebar is always "ready" in seeded dev mode once the handle is attached.
  const sidebarStatus = useSeed ? 'ready' : status;

  if (restoring || !devSeed.ready) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-gray-500">
        <p className="text-sm">Restoring session...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="fixed inset-0 flex flex-col">
        <Header />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <AppSidebar
            status={sidebarStatus}
            dirName={rootDirName}
            nodes={nodes}
            expanded={expanded}
            selectedPath={selectedPath}
            onOpenDirectory={openDirectory}
            onRestoreAccess={restoreAccess}
            onCloseDirectory={closeDirectory}
            onToggle={toggleExpand}
            onSelect={selectFile}
          />
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
            <div className="flex h-10 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3">
              {selectedNode && (
                <nav
                  data-testid="nav-viewer-breadcrumb"
                  aria-label="Breadcrumb"
                  className="flex items-center gap-1 text-sm"
                >
                  {breadcrumbSegments.map((segment, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-gray-300">/</span>}
                      <span
                        className={
                          i === breadcrumbSegments.length - 1
                            ? 'font-medium text-gray-900'
                            : 'text-gray-500'
                        }
                      >
                        {segment}
                      </span>
                    </span>
                  ))}
                </nav>
              )}
              <span
                data-testid="span-vault-status"
                data-test-state={vault.status}
                className="ml-auto text-xs text-gray-500"
              >
                {vault.status === 'ready'
                  ? 'Vault mounted'
                  : vault.status === 'mounting'
                    ? 'Mounting vault\u2026'
                    : vault.status === 'error'
                      ? 'Vault error'
                      : ''}
              </span>
            </div>
            <FileViewer
              viewerState={viewerState}
              selectedNode={selectedNode}
              fileContent={fileContent}
            />
          </div>
          <ChatColumn className="w-[380px] shrink-0 border-l border-gray-200" />
        </div>
      </div>
    </TooltipProvider>
  );
}
