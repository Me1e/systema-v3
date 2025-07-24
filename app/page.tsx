import { Dashboard } from "@/components/dashboard"
import { ChatPanel } from "@/components/chat-panel"

// This page remains a simple layout wrapper.
// The actual data fetching will happen inside the server components.
export default function QueryPage() {
  return (
    <div className="flex h-screen w-full bg-background text-foreground font-sans">
      <Dashboard />
      <ChatPanel />
    </div>
  )
}
