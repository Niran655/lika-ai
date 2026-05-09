import jsPDF from "jspdf";
import type { ChatMsg } from "./streamChat";

function toMarkdown(messages: ChatMsg[]): string {
  return messages
    .map((m) => `### ${m.role === "user" ? "🧑 You" : "🤖 Assistant"}\n\n${m.content}`)
    .join("\n\n---\n\n");
}

function download(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportMarkdown(messages: ChatMsg[], title = "conversation") {
  download(`${title}.md`, toMarkdown(messages), "text/markdown");
}

export function exportText(messages: ChatMsg[], title = "conversation") {
  const txt = messages
    .map((m) => `${m.role === "user" ? "You" : "Assistant"}:\n${m.content}`)
    .join("\n\n");
  download(`${title}.txt`, txt, "text/plain");
}

export function exportPDF(messages: ChatMsg[], title = "conversation") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const lineHeight = 14;
  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, y);
  y += 24;
  doc.setFontSize(11);

  for (const m of messages) {
    doc.setFont("helvetica", "bold");
    doc.text(m.role === "user" ? "You" : "Assistant", margin, y);
    y += lineHeight;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(m.content || "", width);
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += lineHeight;
  }
  doc.save(`${title}.pdf`);
}