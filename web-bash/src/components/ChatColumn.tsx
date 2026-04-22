import { cn } from '@/lib/utils';
import ChatDemo from './chat/ChatDemo';

interface ChatColumnProps {
  className?: string;
}

export default function ChatColumn({ className }: ChatColumnProps) {
  return (
    <div
      data-testid="div-chat-column"
      className={cn('flex flex-col min-h-0 overflow-hidden', className)}
    >
      <ChatDemo />
    </div>
  );
}
