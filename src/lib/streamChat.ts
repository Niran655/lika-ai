export type ChatMsg = { role: "user" | "assistant"; content: string };

export async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: ChatMsg[];
  onDelta: (chunk: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
}) {
  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });

    if (!resp.ok || !resp.body) {
      let msg = `Request failed (${resp.status})`;
      try {
        const j = await resp.json();
        if (j?.error) msg = j.error;
        if (j?.providerError) {
          msg += `\n\nProvider details: ${j.providerError}`;
        }
      } catch {}
      throw new Error(msg);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    while (!done) {
      const { done: streamDone, value } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data: ")) continue;

        const json = line.slice(6).trim();
        if (json === "[DONE]") {
          done = true;
          break;
        }
        try {
          const parsed = JSON.parse(json);
          const text: string | undefined =
            parsed.choices?.[0]?.delta?.content;
          if (text) onDelta(text);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
