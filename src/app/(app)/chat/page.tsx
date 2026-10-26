import { PageHeading } from "@/components/ui";
import { ChatView } from "@/components/chat-view";

export default function ChatPage() {
  return (
    <div className="space-y-4">
      <PageHeading title="Live chat" description="Every buffered message, newest first. Search, filter, or pause the display while you read a point." />
      <ChatView />
    </div>
  );
}
