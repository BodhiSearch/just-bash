import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useAgent } from '@/hooks/useAgent';
import { useMcpList } from '@/hooks/useMcpList';
import { useMcpSelection } from '@/hooks/useMcpSelection';
import { useMcpAgentTools } from '@/hooks/useMcpAgentTools';
import { useBashTool } from '@/hooks/useBashTool';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

export default function ChatDemo() {
  const { mcps, toolsByMcpId, isLoading: isMcpsLoading } = useMcpList();
  const { enabledMcpTools, toggleTool, toggleMcp, getEnabledToolCount, getCheckboxState } =
    useMcpSelection(mcps, toolsByMcpId);
  const { bashEnabled, toggleBash, bashTools } = useBashTool();

  const mcpTools = useMcpAgentTools({ enabledMcpTools, mcps, toolsByMcpId });
  const tools = useMemo(() => [...bashTools, ...mcpTools], [bashTools, mcpTools]);

  const {
    messages,
    streamingMessage,
    isStreaming,
    selectedModel,
    setSelectedModel,
    sendMessage,
    clearMessages,
    error: chatError,
    clearError: clearChatError,
    models,
    isLoadingModels,
    loadModels,
  } = useAgent(tools);

  useEffect(() => {
    if (chatError) {
      toast.error(chatError, {
        onDismiss: clearChatError,
        onAutoClose: clearChatError,
      });
    }
  }, [chatError, clearChatError]);

  return (
    <>
      <ChatMessages
        messages={messages}
        streamingMessage={streamingMessage}
        isStreaming={isStreaming}
        error={chatError}
      />
      <ChatInput
        onSendMessage={sendMessage}
        onClearMessages={clearMessages}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        models={models}
        isLoadingModels={isLoadingModels}
        onRefreshModels={loadModels}
        mcps={mcps}
        toolsByMcpId={toolsByMcpId}
        enabledMcpTools={enabledMcpTools}
        onToggleMcp={toggleMcp}
        onToggleTool={toggleTool}
        getCheckboxState={getCheckboxState}
        enabledToolCount={getEnabledToolCount()}
        isMcpsLoading={isMcpsLoading}
        bashEnabled={bashEnabled}
        onToggleBash={toggleBash}
      />
    </>
  );
}
