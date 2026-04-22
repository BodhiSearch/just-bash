import { FileText, FileWarning, MousePointerClick } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { FileNode, ViewerState } from '@/hooks/useFileTree';

interface FileViewerProps {
  viewerState: ViewerState;
  selectedNode: FileNode | null;
  fileContent: string | null;
}

export default function FileViewer({ viewerState, selectedNode, fileContent }: FileViewerProps) {
  return (
    <div
      data-testid="div-viewer-container"
      data-test-state={viewerState}
      className="flex min-h-0 flex-1 overflow-hidden bg-white"
    >
      {viewerState === 'empty' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
          <MousePointerClick className="size-10" />
          <p className="text-sm">Select a file to view its contents</p>
        </div>
      )}

      {viewerState === 'loading' && (
        <div className="flex flex-1 items-center justify-center text-gray-400">
          <p className="text-sm">Loading...</p>
        </div>
      )}

      {viewerState === 'loaded' && fileContent !== null && (
        <ScrollArea className="min-w-0 flex-1">
          <pre
            data-testid="pre-viewer-content"
            className="p-4 text-sm leading-relaxed whitespace-pre-wrap break-all"
          >
            <code>{fileContent}</code>
          </pre>
        </ScrollArea>
      )}

      {viewerState === 'unsupported' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
          <FileWarning className="size-10" />
          <p data-testid="p-viewer-unsupported" className="text-sm">
            Preview not available for this file type
          </p>
          {selectedNode && (
            <p className="text-xs">
              <FileText className="mr-1 inline size-3" />
              {selectedNode.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
