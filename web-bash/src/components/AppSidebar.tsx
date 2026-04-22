import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  RotateCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { sanitizePath, type FileNode } from '@/hooks/useFileTree';

interface AppSidebarProps {
  status: 'empty' | 'prompt' | 'ready';
  dirName: string | null;
  nodes: FileNode[];
  expanded: Set<string>;
  selectedPath: string | null;
  onOpenDirectory: () => void;
  onRestoreAccess: () => void;
  onCloseDirectory: () => void;
  onToggle: (node: FileNode) => void;
  onSelect: (node: FileNode) => void;
}

export default function AppSidebar({
  status,
  dirName,
  nodes,
  expanded,
  selectedPath,
  onOpenDirectory,
  onRestoreAccess,
  onCloseDirectory,
  onToggle,
  onSelect,
}: AppSidebarProps) {
  const hasTree = status === 'ready' && nodes.length > 0;

  return (
    <aside
      data-testid="div-sidebar-container"
      data-test-state={hasTree ? 'loaded' : 'empty'}
      className="flex flex-col w-64 shrink-0 border-r border-gray-200 bg-gray-50 overflow-hidden"
    >
      {hasTree && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200">
          <span
            data-testid="span-sidebar-dirname"
            className="truncate text-sm font-semibold"
            title={dirName ?? ''}
          >
            {dirName}
          </span>
          <Button
            data-testid="btn-sidebar-close"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onCloseDirectory}
            aria-label="Close directory"
          >
            <X />
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {hasTree ? (
          <ul className="py-1">
            {nodes.map(node => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                expanded={expanded}
                selectedPath={selectedPath}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-4 text-center">
            <FolderOpen className="size-10 text-gray-400" />
            <p className="text-sm text-gray-500">Open a local directory to browse files</p>
            <Button data-testid="btn-sidebar-open" onClick={onOpenDirectory} className="gap-2">
              <FolderPlus />
              Open Directory
            </Button>
            {status === 'prompt' && (
              <Button
                data-testid="btn-sidebar-restore"
                variant="outline"
                onClick={onRestoreAccess}
                className="gap-2"
              >
                <RotateCw />
                Restore Access
              </Button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggle: (node: FileNode) => void;
  onSelect: (node: FileNode) => void;
}

function TreeNode({ node, depth, expanded, selectedPath, onToggle, onSelect }: TreeNodeProps) {
  const isExpanded = expanded.has(node.path);
  const isSelected = selectedPath === node.path;
  const testId = `div-tree-${sanitizePath(node.path)}`;
  const indent = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.kind === 'directory') {
    return (
      <li data-testid={testId}>
        <button
          type="button"
          data-testid={`btn-tree-toggle-${sanitizePath(node.path)}`}
          onClick={() => onToggle(node)}
          style={indent}
          className={cn(
            'flex w-full items-center gap-1 px-2 py-1 text-left text-sm hover:bg-gray-200',
            isSelected && 'bg-gray-200 font-medium'
          )}
        >
          {isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="size-4 shrink-0 text-blue-500" />
          ) : (
            <Folder className="size-4 shrink-0 text-blue-500" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children && (
          <ul>
            {node.children.map(child => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                selectedPath={selectedPath}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li data-testid={testId}>
      <button
        type="button"
        onClick={() => onSelect(node)}
        style={indent}
        className={cn(
          'flex w-full items-center gap-1 px-2 py-1 text-left text-sm hover:bg-gray-200',
          isSelected && 'bg-gray-200 font-medium'
        )}
      >
        <span className="size-3.5 shrink-0" />
        <File className="size-4 shrink-0 text-gray-500" />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}
