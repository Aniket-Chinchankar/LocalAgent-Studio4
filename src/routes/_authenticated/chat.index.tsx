import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { createConversation } from "@/lib/conversations.functions";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: NewChatRedirect,
});

function NewChatRedirect() {
  const navigate = useNavigate();
  const create = useServerFn(createConversation);
  const m = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (row) => navigate({ to: "/chat/$conversationId", params: { conversationId: row.id }, replace: true }),
  });
  useEffect(() => { m.mutate(); }, []); // eslint-disable-line
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      Starting a new conversation…
    </div>
  );
}
