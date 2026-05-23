import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { createConversation } from "@/lib/conversations.functions";

const search = z.object({ agent: z.string().optional() });

export const Route = createFileRoute("/_authenticated/chat/")({
  validateSearch: (s) => search.parse(s),
  component: NewChatRedirect,
});

function NewChatRedirect() {
  const navigate = useNavigate();
  const { agent } = Route.useSearch();
  const create = useServerFn(createConversation);

  const m = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (row) =>
      navigate({
        to: "/chat/$conversationId",
        params: { conversationId: row.id },
        search: agent ? { agent } : undefined,
        replace: true,
      }),
  });

  useEffect(() => {
    m.mutate();
  }, []); // eslint-disable-line

  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      Initializing {agent ? `${agent} session` : "new conversation"}…
    </div>
  );
}
