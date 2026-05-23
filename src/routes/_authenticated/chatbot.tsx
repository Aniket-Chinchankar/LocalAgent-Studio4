import { createFileRoute } from "@tanstack/react-router";
import Chatbot from "@/components/Chatbot";

export const Route = createFileRoute("/_authenticated/chatbot")({
  component: ChatbotRoute,
});

function ChatbotRoute() {
  return (
    <div className="h-full overflow-y-auto bg-background/50">
      <Chatbot />
    </div>
  );
}
