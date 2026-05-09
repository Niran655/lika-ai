import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Trash2,
  Plus,
  MessageSquare,
  LogOut,
  Wrench,
  Sun,
  Moon,
  Download,
  FileText,
  FileCode,
  FileType,
  Menu,
  X,
} from "lucide-react";
import { ChatMessage } from "@/components/ChatMessage";
import LikaLogo from "@/assets/lika-logo.png";
import LogoLoading from "@/assets/lika-logo.png";
import { streamChat, type ChatMsg } from "@/lib/streamChat";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { ToolsPanel } from "@/components/ToolsPanel";
import { useTheme } from "@/lib/theme";
import { exportPDF, exportText, exportMarkdown } from "@/lib/exporters";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listSessions,
  createSession,
  loadMessages,
  saveMessage,
  deleteSession,
  type ChatSession,
} from "@/lib/chatSessions";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Lika AI Assistant" },
      {
        name: "description",
        content:
          "Lika AI Assistant answers general questions, helps with writing, learning, planning, translation, and code.",
      },
    ],
  }),
});

function Index() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auth gate
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
      setAuthReady(true);
      if (!session) navigate({ to: "/auth" });
    });
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setAuthReady(true);
      if (!data.session) navigate({ to: "/auth" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // Load sessions
  useEffect(() => {
    if (!userId) return;
    listSessions()
      .then(setSessions)
      .catch((e) => toast.error(e.message));
  }, [userId]);

  const refreshSessions = async () => {
    try {
      setSessions(await listSessions());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load chats");
    }
  };

  const openSession = async (id: string) => {
    setActiveSessionId(id);
    setMobileMenuOpen(false);
    try {
      setMessages(await loadMessages(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load messages");
    }
  };

  const newChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setMobileMenuOpen(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSession(id);
      if (activeSessionId === id) newChat();
      await refreshSessions();
      setDeleteTarget(null);
      toast.success("Chat deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSignOutOpen(false);
    navigate({ to: "/auth" });
  };

  const doExport = (kind: "pdf" | "txt" | "md") => {
    if (!messages.length) return toast.error("Nothing to export yet");
    const title = sessions.find((s) => s.id === activeSessionId)?.title ?? "conversation";
    if (kind === "pdf") exportPDF(messages, title);
    if (kind === "txt") exportText(messages, title);
    if (kind === "md") exportMarkdown(messages, title);
    setExportOpen(false);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // Ensure we have a session
    let sessionId = activeSessionId;
    let createdNew = false;
    if (!sessionId) {
      try {
        const title = trimmed.slice(0, 60);
        const s = await createSession(title);
        sessionId = s.id;
        setActiveSessionId(s.id);
        createdNew = true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to start chat");
        return;
      }
    }

    const userMsg: ChatMsg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setIsLoading(true);

    // Persist user message (fire-and-forget on error toast)
    saveMessage(sessionId, userMsg).catch((e) => toast.error(e.message));

    let acc = "";
    let assistantStarted = false;

    await streamChat({
      messages: next,
      onDelta: (chunk) => {
        acc += chunk;
        setMessages((prev) => {
          if (!assistantStarted) {
            assistantStarted = true;
            return [...prev, { role: "assistant", content: acc }];
          }
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: acc } : m));
        });
      },
      onDone: async () => {
        setIsLoading(false);
        if (acc) {
          try {
            await saveMessage(sessionId!, { role: "assistant", content: acc });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to save reply");
          }
        }
        if (createdNew) await refreshSessions();
        else {
          // bump ordering
          refreshSessions();
        }
      },
      onError: (err) => {
        setIsLoading(false);
        toast.error(err.message || "Something went wrong");
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const renderSidebar = (mobile = false) => (
    <aside
      className={`flex h-full flex-col border-r border-border bg-card/95 backdrop-blur ${
        mobile ? "w-[min(86vw,20rem)] shadow-xl" : "hidden w-64 md:flex"
      }`}
    >
      <div className="flex items-center justify-between border-b border-border p-3">
        <button
          onClick={newChat}
          className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
        {mobile && (
          <button
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
            className="ml-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {sessions.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">No saved chats yet.</p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.id}>
                <div
                  className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${
                    activeSessionId === s.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  <button
                    onClick={() => openSession(s.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(s)}
                    className="rounded p-1 opacity-70 transition-opacity hover:bg-background hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border p-2">
        <button
          onClick={() => setSignOutOpen(true)}
          className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </aside>
  );

  if (!authReady || !userId) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Toaster />
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="w-[calc(100vw-2rem)] rounded-xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{deleteTarget?.title ?? "this chat"}" from your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] rounded-xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              Your saved chats stay in history. You will need to sign in again to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {renderSidebar()}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 h-full">{renderSidebar(true)}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-card/80 backdrop-blur">
          <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open menu"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="hidden h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background sm:flex">
                <img
                  src={LikaLogo}
                  alt="Lika AI Assistant"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold leading-tight">
                  Lika AI Assistant
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  Khmer · English · Code · Voice
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={toggle}
                aria-label="Toggle theme"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <div className="relative">
                <button
                  onClick={() => setExportOpen((v) => !v)}
                  className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                {exportOpen && (
                  <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                    <button
                      onClick={() => doExport("pdf")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
                    >
                      <FileType className="h-3.5 w-3.5" /> PDF
                    </button>
                    <button
                      onClick={() => doExport("md")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
                    >
                      <FileCode className="h-3.5 w-3.5" /> Markdown
                    </button>
                    <button
                      onClick={() => doExport("txt")}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
                    >
                      <FileText className="h-3.5 w-3.5" /> Plain text
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setToolsOpen((v) => !v)}
                className={`inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs transition-colors ${
                  toolsOpen
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Wrench className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tools</span>
              </button>
              <button
                onClick={newChat}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background">
                  <img
                    src={LikaLogo}
                    alt="Lika AI Assistant"
                    className="h-full w-full object-cover"
                  />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">How can I help you today?</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Ask me about anything: study, writing, translation, planning, ideas, code, or
                  debugging.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m, i) => (
                  <ChatMessage
                    key={i}
                    role={m.role}
                    content={m.content}
                    isStreaming={isLoading && i === messages.length - 1 && m.role === "assistant"}
                  />
                ))}
                {isLoading && messages[messages.length - 1]?.role === "user" && (
                  <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                    <img
                      src={LogoLoading}
                      alt=""
                      className="h-7 w-7 animate-pulse rounded-full object-cover"
                    />
                    Lika Thinking...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border bg-card/50 backdrop-blur">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full items-end gap-2 px-3 py-3 sm:px-6 lg:px-8"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask anything - ideas, study, writing, translation, code..."
              rows={1}
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </form>
        </div>
      </div>
      {toolsOpen && (
        <ToolsPanel
          onClose={() => setToolsOpen(false)}
          onInsertContext={(t) => {
            setInput((prev) => (prev ? prev + "\n\n" + t : t));
            setToolsOpen(false);
          }}
        />
      )}
    </div>
  );
}
