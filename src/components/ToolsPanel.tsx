import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Mic,
  FileText,
  ShieldCheck,
  Brain,
  Play,
  Download,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { parseFile } from "@/lib/parseFile";

type Voice = { id: string; voice_id: string; name: string };

export function ToolsPanel({
  onInsertContext,
  onClose,
}: {
  onInsertContext: (text: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"file" | "analyze" | "plagiarism" | "voice">("file");
  return (
    <div className="fixed inset-0 z-50 flex h-full w-full flex-col border-l border-border bg-card/95 backdrop-blur md:static md:z-auto md:w-96 md:bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">Tools</h2>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex border-b border-border text-xs">
        {(
          [
            ["file", FileText, "File"],
            ["analyze", Brain, "AI Detect"],
            ["plagiarism", ShieldCheck, "Plagiarism"],
            ["voice", Mic, "Voice"],
          ] as const
        ).map(([k, Icon, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 transition-colors ${
              tab === k
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === "file" && <FileTab onInsertContext={onInsertContext} />}
        {tab === "analyze" && <AnalyzeTab mode="ai-detect" />}
        {tab === "plagiarism" && <AnalyzeTab mode="plagiarism" />}
        {tab === "voice" && <VoiceTab />}
      </div>
    </div>
  );
}

/* ───────────── File: upload + summarize/translate ───────────── */

function FileTab({ onInsertContext }: { onInsertContext: (text: string) => void }) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const handle = async (file: File) => {
    setBusy(true);
    try {
      const t = await parseFile(file);
      setText(t);
      setFilename(file.name);
      toast.success(`Loaded ${file.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handle(f);
        }}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          drag ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Drag & drop a PDF or text file, or</p>
        <label className="mt-2 cursor-pointer rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">
          Browse
          <input
            type="file"
            accept=".pdf,.txt,.md,text/plain,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handle(f);
            }}
          />
        </label>
        {busy && <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {text && (
        <>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{filename}</span> ·{" "}
            {text.length.toLocaleString()} chars
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn
              label="Summarize"
              onClick={() =>
                onInsertContext(
                  `Summarize this document and extract the key points (bilingual KH+EN):\n\n${text}`,
                )
              }
            />
            <ActionBtn
              label="Key points"
              onClick={() =>
                onInsertContext(
                  `Extract the most important key points as a bulleted list (bilingual KH+EN):\n\n${text}`,
                )
              }
            />
            <ActionBtn
              label="Translate → ខ្មែរ"
              onClick={() =>
                onInsertContext(
                  `Translate the following to Khmer, preserving meaning and tone:\n\n${text}`,
                )
              }
            />
            <ActionBtn
              label="Translate → EN"
              onClick={() =>
                onInsertContext(
                  `Translate the following to English, preserving meaning and tone:\n\n${text}`,
                )
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function ActionBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent"
    >
      {label}
    </button>
  );
}

/* ───────────── Analyze: AI detection / plagiarism ───────────── */

function AnalyzeTab({ mode }: { mode: "ai-detect" | "plagiarism" }) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    if (!content.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const resp = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, content }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Analysis failed");
      setResult(json.result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {mode === "ai-detect"
          ? "Paste code to estimate human vs AI authorship and surface bugs / improvements."
          : "Paste text to estimate likelihood of plagiarism and highlight suspicious passages."}
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
        placeholder={mode === "ai-detect" ? "Paste code here…" : "Paste text here…"}
        className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
      />
      <button
        onClick={run}
        disabled={busy || !content.trim()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Analyze
      </button>

      {result && mode === "ai-detect" && <AIDetectResult r={result} />}
      {result && mode === "plagiarism" && <PlagResult r={result} />}
    </div>
  );
}

function PercentBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function AIDetectResult({ r }: { r: any }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3 text-xs">
      <PercentBar label="Human" value={r.humanPercent} color="oklch(0.7 0.18 145)" />
      <PercentBar label="AI" value={r.aiPercent} color="oklch(0.7 0.2 30)" />
      <div className="flex gap-2 text-[11px]">
        <span className="rounded bg-muted px-1.5 py-0.5">verdict: {r.verdict}</span>
        <span className="rounded bg-muted px-1.5 py-0.5">confidence: {r.confidence}</span>
      </div>
      <p className="text-foreground">{r.summary}</p>
      {r.signals?.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">Signals</p>
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {r.signals.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {r.bugs?.length > 0 && (
        <div>
          <p className="mb-1 font-semibold text-destructive">Bugs</p>
          <ul className="list-disc space-y-1 pl-4">
            {r.bugs.map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {r.improvements?.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">Improvements</p>
          <ul className="list-disc space-y-1 pl-4">
            {r.improvements.map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PlagResult({ r }: { r: any }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3 text-xs">
      <PercentBar label="Similarity" value={r.similarityPercent} color="oklch(0.7 0.2 50)" />
      <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px]">
        verdict: {r.verdict}
      </span>
      <p>{r.summary}</p>
      {r.passages?.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold">Suspicious passages</p>
          {r.passages.map((p: any, i: number) => (
            <div key={i} className="rounded border border-destructive/40 bg-destructive/10 p-2">
              <p className="italic">"{p.text}"</p>
              <p className="mt-1 text-[11px] text-muted-foreground">— {p.reason}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Note: AI estimate without web search. For authoritative results, use a dedicated plagiarism
        API.
      </p>
    </div>
  );
}

/* ───────────── Voice clone + TTS ───────────── */

function VoiceTab() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [recording, setRecording] = useState(false);
  const [recBlob, setRecBlob] = useState<Blob | null>(null);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("My voice");
  const [text, setText] = useState("ជំរាបសួរ! Hello, this is my cloned voice.");
  const [activeVoice, setActiveVoice] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const refresh = async () => {
    const { data } = await supabase
      .from("user_voices")
      .select("id,voice_id,name")
      .order("created_at", { ascending: false });
    setVoices(data ?? []);
    if (data?.[0] && !activeVoice) setActiveVoice(data[0].voice_id);
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        setRecBlob(blob);
        setRecUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Microphone permission denied");
    }
  };
  const stopRec = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const handleUpload = (file: File) => {
    setRecBlob(file);
    setRecUrl(URL.createObjectURL(file));
  };

  const submitClone = async () => {
    if (!recBlob) return toast.error("Record or upload a 10–20 second sample");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", recBlob, "sample.webm");
      fd.append("name", name || "My voice");
      const resp = await fetch("/api/voice/clone", { method: "POST", body: fd });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Clone failed");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) throw new Error("Not authenticated");
      const { error } = await supabase.from("user_voices").insert({
        user_id: u.user.id,
        voice_id: json.voiceId,
        name: json.name,
      });
      if (error) throw error;
      toast.success("Voice cloned!");
      setRecBlob(null);
      setRecUrl(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clone failed");
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!activeVoice) return toast.error("Select a voice first");
    if (!text.trim()) return;
    setBusy(true);
    setAudioUrl(null);
    try {
      const resp = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId: activeVoice }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.error || "TTS failed");
      }
      const blob = await resp.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "TTS failed");
    } finally {
      setBusy(false);
    }
  };

  const removeVoice = async (id: string) => {
    await supabase.from("user_voices").delete().eq("id", id);
    refresh();
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold">1. Clone your voice</h3>
        <p className="text-[11px] text-muted-foreground">
          Record 10–20s of clear speech, or upload an audio file.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Voice name"
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
        />
        <div className="flex gap-2">
          {!recording ? (
            <button
              onClick={startRec}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs hover:bg-accent"
            >
              <Mic className="h-3.5 w-3.5" /> Record
            </button>
          ) : (
            <button
              onClick={stopRec}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-destructive px-2 py-1.5 text-xs text-destructive-foreground"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          )}
          <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs hover:bg-accent">
            <Upload className="h-3.5 w-3.5" /> Upload
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </label>
        </div>
        {recUrl && (
          <div className="space-y-2 rounded-md border border-border p-2">
            <audio src={recUrl} controls className="w-full" />
            <button
              onClick={submitClone}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Submit clone
            </button>
          </div>
        )}
      </section>

      {voices.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold">2. Your voices</h3>
          <div className="space-y-1">
            {voices.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs ${
                  activeVoice === v.voice_id ? "border-primary bg-primary/10" : "border-border"
                }`}
              >
                <button onClick={() => setActiveVoice(v.voice_id)} className="flex-1 text-left">
                  {v.name}
                </button>
                <button
                  onClick={() => removeVoice(v.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold">3. Generate speech (KH / EN)</h3>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background p-2 text-xs"
        />
        <button
          onClick={generate}
          disabled={busy || !activeVoice}
          className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Generate
        </button>
        {audioUrl && (
          <div className="space-y-2 rounded-md border border-border p-2">
            <audio src={audioUrl} controls className="w-full" />
            <a
              href={audioUrl}
              download="voice.mp3"
              className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" /> Download MP3
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
