import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/voice/clone")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const key = process.env.ELEVENLABS_API_KEY;
          if (!key)
            return Response.json(
              { error: "ELEVENLABS_API_KEY is not configured" },
              { status: 500 },
            );

          const incoming = await request.formData();
          const file = incoming.get("file");
          const name = (incoming.get("name") as string) || "My voice";
          if (!(file instanceof File)) {
            return Response.json({ error: "Missing audio file" }, { status: 400 });
          }

          const fd = new FormData();
          fd.append("name", name);
          fd.append("files", file, file.name || "sample.webm");
          fd.append("description", "Cloned via Lika AI Assistant");

          const resp = await fetch("https://api.elevenlabs.io/v1/voices/add", {
            method: "POST",
            headers: { "xi-api-key": key },
            body: fd,
          });
          if (!resp.ok) {
            const t = await resp.text();
            console.error("ElevenLabs clone error", resp.status, t);
            return Response.json({ error: t || "Voice clone failed" }, { status: resp.status });
          }
          const json = (await resp.json()) as { voice_id: string };
          return Response.json({ voiceId: json.voice_id, name });
        } catch (err) {
          console.error(err);
          return Response.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
