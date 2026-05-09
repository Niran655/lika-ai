import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const label = language?.trim() || "code";
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="group relative my-4 min-w-0 overflow-hidden rounded-lg border border-border bg-[#282c34] shadow-sm">
      <div className="flex min-h-9 items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/70">
        <span className="min-w-0 truncate font-mono lowercase">{label}</span>
        <button
          onClick={copy}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label={copied ? "Code copied" : "Copy code"}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="max-w-full overflow-x-auto">
        <SyntaxHighlighter
          language={label}
          style={oneDark}
          showLineNumbers
          wrapLongLines={false}
          customStyle={{
            margin: 0,
            minWidth: "max-content",
            background: "transparent",
            fontSize: "0.82rem",
            lineHeight: 1.65,
            padding: "0.85rem 1rem",
          }}
          codeTagProps={{
            style: {
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            },
          }}
          lineNumberStyle={{ color: "rgba(255,255,255,0.32)", minWidth: "2.25em" }}
        >
          {value.replace(/\n$/, "")}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
