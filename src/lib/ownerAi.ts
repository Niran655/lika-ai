type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8765/v1";
const DEFAULT_MODEL = "owner-ai-python";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const OWNER_AI_SYSTEM_PROMPT = `You are Lika AI Assistant, a helpful general-purpose AI assistant trained for this workspace.

IDENTITY
- You belong to the app owner and this workspace.
- You are a bilingual Khmer + English assistant for general questions, learning, writing, translation, planning, creativity, productivity, and coding.
- You learn from the owner's style, project context, saved chats, pasted files, and direct instructions in each request.

LANGUAGE
- Detect the user's language automatically.
- If the user writes in Khmer, reply primarily in Khmer and keep important technical terms in English.
- If the user writes in English, reply in English.
- If mixed, mirror the mix.

WORK STYLE
- Be direct, practical, friendly, and easy to understand.
- Answer general knowledge, personal productivity, study, writing, translation, brainstorming, and everyday questions clearly.
- For broad or complex topics, organize the answer with short sections, steps, examples, or bullets.
- When the user asks for advice, explain tradeoffs and ask a concise follow-up only if the missing detail is important.
- For coding questions, explain code clearly, identify likely causes when debugging, give the fix, and explain why it works.
- When the user asks you to create a coding project, app, website, bot, API, or other multi-file software, provide a complete project structure and include all important files.
- For downloadable project answers, put each file in its own fenced code block and include the file path in the fence info, for example: three-backtick tsx file="src/App.tsx" or three-backtick json file="package.json". This lets the app create a ZIP folder for the user.
- For large projects, start with a short file tree, then provide the files. Do not omit essential setup files unless the user asks for only a sketch.
- Never invent APIs. If unsure, say what must be verified.
- For medical, legal, financial, or safety-sensitive questions, be careful, explain limits, and encourage professional help when appropriate.

TRAINING BEHAVIOR
- Treat project files, user preferences, and corrections as owner training signals.
- Use the visible chat history as memory for the current conversation: remember what the user already asked, avoid repeating solved context, and continue with the same assumptions unless the user changes them.
- Adapt to the user's attitude and communication style. If they are brief, be concise; if they are confused, slow down and clarify; if they are frustrated, acknowledge the problem and move directly to a practical fix.
- Prefer the owner's existing stack and conventions.
- If the owner gives a rule, remember it within the conversation and follow it consistently.`;

function ownerAiConfig() {
  const configuredBaseUrl = (process.env.OWNER_AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const allowRemote = process.env.OWNER_AI_ALLOW_REMOTE === "true";
  const baseUrl = allowRemote ? configuredBaseUrl : DEFAULT_BASE_URL;
  const model = process.env.OWNER_AI_MODEL || DEFAULT_MODEL;
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const geminiModel = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  return { baseUrl, model, geminiApiKey, geminiModel };
}

function splitGeminiMessages(messages: ChatMessage[]) {
  const systemTexts: string[] = [];
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemTexts.push(message.content);
      continue;
    }

    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    });
  }

  return {
    systemInstruction: systemTexts.length
      ? { parts: [{ text: systemTexts.join("\n\n") }] }
      : undefined,
    contents,
  };
}

function geminiUrl(model: string, action: "generateContent" | "streamGenerateContent") {
  const suffix =
    action === "streamGenerateContent" ? ":streamGenerateContent?alt=sse" : ":generateContent";
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}${suffix}`;
}

async function geminiFetch(
  model: string,
  action: "generateContent" | "streamGenerateContent",
  apiKey: string,
  body: unknown,
) {
  return fetch(geminiUrl(model, action), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
}

function openAiStreamFromGemini(body: ReadableStream<Uint8Array> | null) {
  if (!body) return null;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;

          const json = line.slice(6).trim();
          if (!json || json === "[DONE]") continue;

          try {
            const parsed = JSON.parse(json);
            const text = parsed.candidates?.[0]?.content?.parts
              ?.map((part: { text?: string }) => part.text ?? "")
              .join("");

            if (text) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
                ),
              );
            }
          } catch {
            // Wait for more data if the provider split a JSON event.
            buffer = line + "\n" + buffer;
            break;
          }
        }
      },
      flush(controller) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      },
    }),
  );
}

function jsonSchemaFromTool(tool: ToolDefinition) {
  return JSON.parse(JSON.stringify(tool.parameters));
}

function openAiToolResponse(toolName: string, args: unknown, model: string) {
  return Response.json({
    id: `gemini_${crypto.randomUUID().replace(/-/g, "")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
              type: "function",
              function: {
                name: toolName,
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  });
}

function openAiTextResponse(text: string, model: string) {
  return Response.json({
    id: `gemini_${crypto.randomUUID().replace(/-/g, "")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
  });
}

async function geminiChatCompletion({
  messages,
  stream,
  tools,
  toolChoice,
  apiKey,
  model,
}: {
  messages: ChatMessage[];
  stream: boolean;
  tools?: ToolDefinition[];
  toolChoice?: { name: string };
  apiKey: string;
  model: string;
}) {
  const { systemInstruction, contents } = splitGeminiMessages(messages);
  const selectedTool = toolChoice
    ? tools?.find((tool) => tool.name === toolChoice.name)
    : tools?.[0];

  const body: Record<string, unknown> = {
    contents,
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;

  if (selectedTool) {
    body.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: jsonSchemaFromTool(selectedTool),
    };
  }

  try {
    const upstream = await geminiFetch(
      model,
      stream && !selectedTool ? "streamGenerateContent" : "generateContent",
      apiKey,
      body,
    );

    if (!upstream.ok) return { upstream };

    if (stream && !selectedTool) {
      return {
        upstream: new Response(openAiStreamFromGemini(upstream.body), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        }),
      };
    }

    const json = await upstream.json();
    const text =
      json.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("") ?? "";

    if (selectedTool) {
      return {
        upstream: openAiToolResponse(selectedTool.name, JSON.parse(text || "{}"), model),
      };
    }

    return { upstream: openAiTextResponse(text, model) };
  } catch (err) {
    console.error("Gemini API unreachable", err);
    return {
      response: Response.json(
        {
          error:
            "Gemini API is unreachable. Check GEMINI_API_KEY, your network connection, and that the dev server was restarted after editing .env.",
        },
        { status: 503 },
      ),
    };
  }
}

export async function ownerAiChatCompletion({
  messages,
  stream = false,
  tools,
  toolChoice,
}: {
  messages: ChatMessage[];
  stream?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: { name: string };
}) {
  const { baseUrl, model, geminiApiKey, geminiModel } = ownerAiConfig();

  if (geminiApiKey) {
    return geminiChatCompletion({
      messages,
      stream,
      tools,
      toolChoice,
      apiKey: geminiApiKey,
      model: geminiModel,
    });
  }

  const body: Record<string, unknown> = {
    model,
    stream,
    messages,
  };

  if (tools?.length) {
    body.tools = tools.map((tool) => ({ type: "function", function: tool }));
  }

  if (toolChoice) {
    body.tool_choice = {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("Owner AI Python API unreachable", err);
    return {
      response: Response.json(
        {
          error:
            "Owner AI Python API is not running. Start it with `npm run owner-ai`, then run the app again.",
        },
        { status: 503 },
      ),
    };
  }

  return { upstream };
}

export async function ownerAiErrorResponse(upstream: Response) {
  const text = await upstream.text();

  if (upstream.status === 401 || upstream.status === 403) {
    console.error("Owner AI rejected request", upstream.status, text);
    return Response.json(
      {
        error:
          "Owner AI request was rejected by a non-local provider. This app now forces http://127.0.0.1:8765/v1 unless OWNER_AI_ALLOW_REMOTE=true. Restart `npm run dev`.",
        status: upstream.status,
        providerError: text,
      },
      { status: upstream.status },
    );
  }
  if (upstream.status === 429) {
    return Response.json(
      { error: "Owner AI rate limit reached. Try again shortly." },
      { status: 429 },
    );
  }
  if (upstream.status === 402) {
    return Response.json({ error: "Owner AI credits exhausted." }, { status: 402 });
  }

  console.error("Owner AI provider error", upstream.status, text);
  return Response.json(
    { error: "Owner AI Python API error", status: upstream.status, providerError: text },
    { status: 500 },
  );
}
