import { createFileRoute } from "@tanstack/react-router";
import {
  OWNER_AI_SYSTEM_PROMPT,
  ownerAiChatCompletion,
  ownerAiErrorResponse,
} from "@/lib/ownerAi";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages } = (await request.json()) as {
            messages: { role: "user" | "assistant"; content: string }[];
          };

          const { upstream, response } = await ownerAiChatCompletion({
            stream: true,
            messages: [{ role: "system", content: OWNER_AI_SYSTEM_PROMPT }, ...messages],
          });
          if (response) return response;

          if (!upstream.ok) {
            return ownerAiErrorResponse(upstream);
          }

          return new Response(upstream.body, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
            },
          });
        } catch (err) {
          console.error("/api/chat error", err);
          return new Response(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Unknown error",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
