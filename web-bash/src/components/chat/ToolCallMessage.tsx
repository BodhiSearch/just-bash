import { useState } from 'react';
import { ChevronRight, ChevronDown, Wrench } from 'lucide-react';
import type { ToolCall } from '@mariozechner/pi-ai';
import type { ToolResultMessage } from '@mariozechner/pi-ai';
import { getToolCalls, type AgentMessage } from '@/types/chat';
import { decodeMcpToolName } from '@/lib/mcp-tools';

function toolResultText(result: ToolResultMessage): string {
  if (typeof result.content === 'string') return result.content;
  if (!Array.isArray(result.content)) return '';
  return result.content
    .filter(p => p && typeof p === 'object' && 'type' in p && p.type === 'text' && 'text' in p)
    .map(p => (p as { text: string }).text)
    .join('');
}

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  result?: ToolResultMessage;
}

function ToolCallDisplay({ toolCall, result }: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const decoded = decodeMcpToolName(toolCall.name);
  const displayName = decoded ? `${decoded.mcpSlug} / ${decoded.toolName}` : toolCall.name;
  const parsedArgs = JSON.stringify(toolCall.arguments, null, 2);
  const resultText = result ? toolResultText(result) : '';

  return (
    <div
      className="border border-gray-200 rounded-lg overflow-hidden"
      data-testid="tool-call-item"
      data-tool-name={toolCall.name}
      data-tool-call-id={toolCall.id}
      data-teststate={result ? 'completed' : 'executing'}
    >
      <button
        data-testid="tool-call-expand"
        className="flex items-center gap-2 w-full p-2 text-left text-sm hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <Wrench className="size-4 text-gray-500" />
        <span className="font-medium">{displayName}</span>
        <span
          data-testid="tool-call-status"
          className={`ml-auto text-xs ${result ? 'text-green-600' : 'text-yellow-600'}`}
        >
          {result ? 'completed' : 'executing...'}
        </span>
      </button>
      {result && (
        <pre
          data-testid="tool-call-result-raw"
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            left: -9999,
            overflow: 'hidden',
            whiteSpace: 'pre',
          }}
        >
          {resultText}
        </pre>
      )}
      {isExpanded && (
        <div data-testid="tool-call-content" className="p-2 border-t text-xs">
          <div className="mb-2">
            <div className="font-medium text-gray-500 mb-1">Arguments</div>
            <pre
              data-testid="tool-call-arguments"
              className="bg-gray-50 p-2 rounded overflow-x-auto"
            >
              {parsedArgs}
            </pre>
          </div>
          {result && (
            <div>
              <div className="font-medium text-gray-500 mb-1">Result</div>
              <pre
                data-testid="tool-call-result"
                className="bg-gray-50 p-2 rounded overflow-x-auto max-h-40"
              >
                {resultText.slice(0, 500)}
                {resultText.length > 500 ? '...' : ''}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ToolCallMessageProps {
  message: AgentMessage;
  toolResults: Map<string, ToolResultMessage>;
}

export default function ToolCallMessage({ message, toolResults }: ToolCallMessageProps) {
  const toolCalls = getToolCalls(message);
  if (toolCalls.length === 0) return null;

  return (
    <div data-testid="tool-call-message" className="flex justify-start mb-4">
      <div className="max-w-[80%] space-y-2">
        {toolCalls.map(tc => (
          <ToolCallDisplay key={tc.id} toolCall={tc} result={toolResults.get(tc.id)} />
        ))}
      </div>
    </div>
  );
}
