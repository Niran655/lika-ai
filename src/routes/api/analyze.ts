import { createFileRoute } from "@tanstack/react-router";
import { ownerAiChatCompletion, ownerAiErrorResponse } from "@/lib/ownerAi";

type Mode = "ai-detect" | "plagiarism";

const PROMPTS: Record<Mode, string> = {
  "ai-detect": `You are an expert at distinguishing human-written code from AI-generated code.
Analyze the provided code and estimate the percentage that looks human-written vs AI-generated.
Look at: variable naming patterns, comment style, structural quirks, over-engineering, generic boilerplate, perfect formatting, error-handling patterns.
Also report obvious bugs, code smells, and concrete performance improvements.
Return ONLY the tool call. Be honest about uncertainty; if it is truly ambiguous, lean toward 50/50.`,
  plagiarism: `You are a plagiarism analyst. Without access to the web, estimate how likely the document is copied from common public sources such as textbooks, Wikipedia, well-known articles, or popular blog posts.
Look at: stock phrasing, formulaic sentences, mismatched register, and missing citations of obvious quotes.
Identify suspicious passages verbatim. Be conservative; only flag what truly reads as boilerplate or famous text.
Return ONLY the tool call.`,
};

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { mode, content } = (await request.json()) as { mode: Mode; content: string };
          if (mode !== "ai-detect" && mode !== "plagiarism") {
            return Response.json({ error: "Invalid analysis mode" }, { status: 400 });
          }
          if (!content?.trim()) {
            return Response.json({ error: "Empty content" }, { status: 400 });
          }

          const tool =
            mode === "ai-detect"
              ? {
                  name: "report_ai_detection",
                  description: "Report human vs AI percentages with findings.",
                  parameters: {
                    type: "object",
                    properties: {
                      humanPercent: { type: "number", minimum: 0, maximum: 100 },
                      aiPercent: { type: "number", minimum: 0, maximum: 100 },
                      verdict: { type: "string", enum: ["mostly-human", "mixed", "mostly-ai"] },
                      confidence: { type: "string", enum: ["low", "medium", "high"] },
                      signals: { type: "array", items: { type: "string" } },
                      bugs: { type: "array", items: { type: "string" } },
                      improvements: { type: "array", items: { type: "string" } },
                      summary: { type: "string" },
                    },
                    required: ["humanPercent", "aiPercent", "verdict", "confidence", "signals", "summary"],
                  },
                }
              : {
                  name: "report_plagiarism",
                  description: "Report likelihood of plagiarism with highlighted passages.",
                  parameters: {
                    type: "object",
                    properties: {
                      similarityPercent: { type: "number", minimum: 0, maximum: 100 },
                      verdict: { type: "string", enum: ["original", "uncertain", "likely-copied"] },
                      passages: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            text: { type: "string" },
                            reason: { type: "string" },
                          },
                          required: ["text", "reason"],
                        },
                      },
                      summary: { type: "string" },
                    },
                    required: ["similarityPercent", "verdict", "passages", "summary"],
                  },
                };

          const { upstream, response, provider } = await ownerAiChatCompletion({
            messages: [
              { role: "system", content: PROMPTS[mode] },
              { role: "user", content: content.slice(0, 30000) },
            ],
            tools: [tool],
            toolChoice: { name: tool.name },
          });
          if (response) return response;

          if (!upstream.ok) {
            return ownerAiErrorResponse(upstream, provider);
          }

          const json = await upstream.json();
          const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          if (!args) return Response.json({ error: "No analysis returned" }, { status: 500 });

          return Response.json({ result: JSON.parse(args) });
        } catch (err) {
          console.error(err);
          return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
        }
      },
    },
  },
});
