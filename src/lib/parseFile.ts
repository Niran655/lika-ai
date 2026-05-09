// Parse uploaded text/PDF files in the browser.

export async function parseFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return parsePdf(file);
  }
  // Fallback: treat as text
  return await file.text();
}

async function parsePdf(file: File): Promise<string> {
  // Dynamic import to keep PDF.js out of the SSR bundle.
  const pdfjs: any = await import("pdfjs-dist");
  // Use the official worker shipped with the package via Vite ?url import.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
    out += `\n\n--- Page ${i} ---\n${text}`;
  }
  return out.trim();
}