import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/voice/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const key = process.env.ELEVENLABS_API_KEY;
          if (!key) return Response.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 500 });
          const { text, voiceId } = (await request.json()) as { text: string; voiceId: string };
          if (!text || !voiceId) return Response.json({ error: "Missing text or voiceId" }, { status: 400 });

          const resp = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: { "xi-api-key": key, "Content-Type": "application/json" },
              body: JSON.stringify({
                text: text.slice(0, 4000),
                model_id: "eleven_multilingual_v2",
                voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.3, use_speaker_boost: true },
              }),
            },
          );
          if (!resp.ok) {
            const t = await resp.text();
            console.error("ElevenLabs TTS error", resp.status, t);
            return Response.json({ error: t || "TTS failed" }, { status: resp.status });
          }
          return new Response(resp.body, {
            headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
          });
        } catch (err) {
          console.error(err);
          return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
        }
      },
    },
  },
});