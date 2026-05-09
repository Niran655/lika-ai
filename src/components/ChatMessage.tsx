import ReactMarkdown from "react-markdown";
import type { ComponentPropsWithoutRef } from "react";
import remarkGfm from "remark-gfm";
import { FolderDown, User } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { downloadProjectZip, extractProjectFiles } from "@/lib/projectZip";
import LikaLogo from "@/assets/lika-logo.png";

export type ChatRole = "user" | "assistant";

function closeStreamingCodeFence(content: string) {
  const fenceCount = content.match(/^```/gm)?.length ?? 0;
  return fenceCount % 2 === 1 ? `${content}\n${"```"}` : content;
}

export function ChatMessage({
  role,
  content,
  isStreaming = false,
}: {
  role: ChatRole;
  content: string;
  isStreaming?: boolean;
}) {
  const isUser = role === "user";
  const projectFiles = isUser ? [] : extractProjectFiles(content);
  const renderedContent = !isUser && isStreaming ? closeStreamingCodeFence(content) : content;

  const downloadZip = () => {
    downloadProjectZip(content, "lika-project");
  };

  return (
    <div className={`flex min-w-0 gap-2 sm:gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background sm:h-8 sm:w-8">
          <img src={LikaLogo} alt="Lika AI" className="h-full w-full object-cover" />
        </div>
      )}

      <div
        className={`min-w-0 break-words rounded-2xl px-3.5 py-3 text-sm leading-7 shadow-sm sm:px-4 ${
          isUser
            ? "max-w-[88%] rounded-br-sm bg-primary text-primary-foreground sm:max-w-[80%]"
            : "max-w-full flex-1 rounded-bl-sm border border-border bg-card text-card-foreground"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <>
            {projectFiles.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <div className="text-xs leading-5 text-muted-foreground">
                  <span className="font-medium text-foreground">Project files detected</span>
                  <span className="ml-1">
                    {projectFiles.length} file{projectFiles.length === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  onClick={downloadZip}
                  className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  <FolderDown className="h-4 w-4" />
                  Download ZIP
                </button>
              </div>
            )}
            <div className="min-w-0 max-w-none overflow-hidden text-[0.95rem] leading-7 text-card-foreground [overflow-wrap:anywhere]">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1({ children }) {
                    return (
                      <h1 className="mb-3 mt-1 text-xl font-semibold leading-8 tracking-tight">
                        {children}
                      </h1>
                    );
                  },
                  h2({ children }) {
                    return (
                      <h2 className="mb-2.5 mt-5 text-lg font-semibold leading-7 tracking-tight first:mt-0">
                        {children}
                      </h2>
                    );
                  },
                  h3({ children }) {
                    return (
                      <h3 className="mb-2 mt-4 text-base font-semibold leading-6 first:mt-0">
                        {children}
                      </h3>
                    );
                  },
                  p({ children }) {
                    return <p className="my-3 first:mt-0 last:mb-0">{children}</p>;
                  },
                  ul({ children }) {
                    return (
                      <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
                        {children}
                      </ul>
                    );
                  },
                  ol({ children }) {
                    return (
                      <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:text-muted-foreground">
                        {children}
                      </ol>
                    );
                  },
                  li({ children }) {
                    return <li className="pl-1 leading-7">{children}</li>;
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="my-4 border-l-4 border-primary/40 bg-muted/50 py-2 pl-4 pr-3 text-muted-foreground">
                        {children}
                      </blockquote>
                    );
                  },
                  a({ children, href }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary underline underline-offset-4"
                      >
                        {children}
                      </a>
                    );
                  },
                  hr() {
                    return <hr className="my-5 border-border" />;
                  },
                  table({ children }) {
                    return (
                      <div className="my-4 max-w-full overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-96 border-collapse text-left text-sm">
                          {children}
                        </table>
                      </div>
                    );
                  },
                  th({ children }) {
                    return (
                      <th className="border-b border-border bg-muted px-3 py-2 font-semibold">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="border-b border-border px-3 py-2 align-top">{children}</td>
                    );
                  },
                  code({
                    inline,
                    className,
                    children,
                    ...props
                  }: ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
                    const match = /language-(\w+)/.exec(className || "");
                    if (!inline) {
                      return <CodeBlock language={match?.[1] ?? "text"} value={String(children)} />;
                    }
                    return (
                      <code
                        className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground [overflow-wrap:anywhere]"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {renderedContent || "..."}
              </ReactMarkdown>
            </div>
          </>
        )}
      </div>

      {isUser && (
        <div className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground sm:flex">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
