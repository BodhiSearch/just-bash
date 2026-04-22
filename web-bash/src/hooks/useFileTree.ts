import { useState, useCallback, useEffect } from 'react';

export interface FileNode {
  name: string;
  kind: 'file' | 'directory';
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  path: string;
  children?: FileNode[];
  loaded?: boolean;
}

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.htm',
  '.xml',
  '.svg',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.env',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.py',
  '.rb',
  '.rs',
  '.go',
  '.java',
  '.kt',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.php',
  '.lua',
  '.r',
  '.sql',
  '.graphql',
  '.gql',
  '.proto',
  '.gitignore',
  '.dockerignore',
  '.editorconfig',
  '.lock',
  '.log',
]);

const EXTENSIONLESS_TEXT_FILES = new Set([
  'Makefile',
  'Dockerfile',
  'Containerfile',
  'Procfile',
  'LICENSE',
  'LICENCE',
  'README',
  'CHANGELOG',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.nvmrc',
  '.prettierrc',
  '.eslintrc',
  '.babelrc',
]);

export function isTextFile(name: string): boolean {
  if (EXTENSIONLESS_TEXT_FILES.has(name)) return true;
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx === -1) return false;
  return TEXT_EXTENSIONS.has(name.slice(dotIdx).toLowerCase());
}

export function sanitizePath(path: string): string {
  return path
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export type ViewerState = 'empty' | 'loading' | 'loaded' | 'unsupported';

async function readDirEntries(
  dirHandle: FileSystemDirectoryHandle,
  parentPath: string
): Promise<FileNode[]> {
  const entries: FileNode[] = [];
  for await (const [name, handle] of dirHandle.entries()) {
    entries.push({
      name,
      kind: handle.kind,
      handle,
      path: parentPath ? `${parentPath}/${name}` : name,
      children: handle.kind === 'directory' ? [] : undefined,
      loaded: handle.kind === 'directory' ? false : undefined,
    });
  }
  return sortNodes(entries);
}

function sortNodes(nodes: FileNode[]): FileNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

interface TreeState {
  nodes: FileNode[];
  expanded: Set<string>;
  selectedPath: string | null;
  selectedNode: FileNode | null;
  fileContent: string | null;
  viewerState: ViewerState;
}

const EMPTY_STATE: TreeState = {
  nodes: [],
  expanded: new Set<string>(),
  selectedPath: null,
  selectedNode: null,
  fileContent: null,
  viewerState: 'empty',
};

export interface UseFileTreeResult extends TreeState {
  toggleExpand: (node: FileNode) => Promise<void>;
  selectFile: (node: FileNode) => Promise<void>;
}

export function useFileTree(handle: FileSystemDirectoryHandle | null): UseFileTreeResult {
  const [state, setState] = useState<TreeState>(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    // Defer to a microtask so state updates aren't synchronously reachable
    // from the effect body (react-hooks/set-state-in-effect).
    Promise.resolve().then(async () => {
      if (cancelled) return;
      if (!handle) {
        setState(EMPTY_STATE);
        return;
      }
      const root = await readDirEntries(handle, '');
      if (cancelled) return;
      setState({ ...EMPTY_STATE, nodes: root });
    });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const toggleExpand = useCallback(
    async (node: FileNode) => {
      if (node.kind !== 'directory') return;

      const isCurrentlyExpanded = state.expanded.has(node.path);
      if (isCurrentlyExpanded) {
        setState(prev => {
          const next = new Set(prev.expanded);
          next.delete(node.path);
          return { ...prev, expanded: next };
        });
        return;
      }

      if (!node.loaded) {
        const children = await readDirEntries(node.handle as FileSystemDirectoryHandle, node.path);
        setState(prev => ({
          ...prev,
          nodes: updateNodeChildren(prev.nodes, node.path, children),
        }));
      }

      setState(prev => ({
        ...prev,
        expanded: new Set(prev.expanded).add(node.path),
      }));
    },
    [state.expanded]
  );

  const selectFile = useCallback(async (node: FileNode) => {
    if (node.kind === 'directory') {
      setState(prev => ({
        ...prev,
        selectedPath: node.path,
        selectedNode: node,
        viewerState: 'empty',
        fileContent: null,
      }));
      return;
    }

    if (!isTextFile(node.name)) {
      setState(prev => ({
        ...prev,
        selectedPath: node.path,
        selectedNode: node,
        viewerState: 'unsupported',
        fileContent: null,
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      selectedPath: node.path,
      selectedNode: node,
      viewerState: 'loading',
      fileContent: null,
    }));

    try {
      const file = await (node.handle as FileSystemFileHandle).getFile();
      const text = await file.text();
      // Simple binary sniff: NUL byte within the first 4KB means unsupported.
      const isBinary = text.slice(0, 4096).indexOf('\u0000') !== -1;
      setState(prev => ({
        ...prev,
        fileContent: isBinary ? null : text,
        viewerState: isBinary ? 'unsupported' : 'loaded',
      }));
    } catch {
      setState(prev => ({
        ...prev,
        viewerState: 'unsupported',
        fileContent: null,
      }));
    }
  }, []);

  return {
    ...state,
    toggleExpand,
    selectFile,
  };
}

function updateNodeChildren(
  nodes: FileNode[],
  targetPath: string,
  children: FileNode[]
): FileNode[] {
  return nodes.map(node => {
    if (node.path === targetPath) {
      return { ...node, children, loaded: true };
    }
    if (node.children && targetPath.startsWith(node.path + '/')) {
      return {
        ...node,
        children: updateNodeChildren(node.children, targetPath, children),
      };
    }
    return node;
  });
}
