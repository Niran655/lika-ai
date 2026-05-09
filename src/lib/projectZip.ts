type ProjectFile = {
  path: string;
  content: string;
};

const TEXT_EXTENSIONS: Record<string, string> = {
  javascript: "js",
  js: "js",
  jsx: "jsx",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  html: "html",
  css: "css",
  scss: "scss",
  json: "json",
  markdown: "md",
  md: "md",
  python: "py",
  py: "py",
  shell: "sh",
  bash: "sh",
  sh: "sh",
  sql: "sql",
  yaml: "yml",
  yml: "yml",
  env: "env",
  text: "txt",
  txt: "txt",
};

const FILE_PATH_PATTERN =
  /(?:^|[\s`*_([])((?:[\w@.-]+\/)*[\w@.-]+\.(?:tsx?|jsx?|json|html|css|scss|md|txt|py|sh|sql|ya?ml|env|gitignore|dockerfile))(?:$|[\s`*_)\]])/i;

function sanitizePath(path: string) {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function pathFromFenceInfo(info: string) {
  const quoted = info.match(/(?:title|file|filename|path)=["']([^"']+)["']/i)?.[1];
  if (quoted) return sanitizePath(quoted);

  const bare = info.match(/(?:title|file|filename|path)=([^\s]+)/i)?.[1];
  if (bare) return sanitizePath(bare);

  const directPath = info.match(FILE_PATH_PATTERN)?.[1];
  return directPath ? sanitizePath(directPath) : "";
}

function pathFromContext(context: string) {
  const lines = context
    .split("\n")
    .slice(-5)
    .map((line) =>
      line
        .replace(/^#+\s*/, "")
        .replace(/^[-*]\s*/, "")
        .trim(),
    )
    .reverse();

  for (const line of lines) {
    const labeled = line.match(/(?:file|path|create|update)\s*:?\s*`?([^`\s]+\.[\w.]+)`?/i)?.[1];
    if (labeled) return sanitizePath(labeled);

    const plain = line.match(FILE_PATH_PATTERN)?.[1];
    if (plain) return sanitizePath(plain);
  }

  return "";
}

function extensionForLanguage(language: string) {
  return TEXT_EXTENSIONS[language.toLowerCase()] ?? "txt";
}

export function extractProjectFiles(markdown: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const usedPaths = new Set<string>();
  const fenceRegex = /```([^\n`]*)\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;
  let snippetIndex = 1;

  while ((match = fenceRegex.exec(markdown))) {
    const rawInfo = match[1].trim();
    const language = rawInfo.split(/\s+/)[0] || "text";
    const content = match[2].replace(/\n$/, "");
    const context = markdown.slice(Math.max(0, match.index - 300), match.index);
    let path = pathFromFenceInfo(rawInfo) || pathFromContext(context);

    if (!path && files.length > 0) {
      path = `snippets/snippet-${snippetIndex}.${extensionForLanguage(language)}`;
      snippetIndex += 1;
    }

    if (!path) continue;

    let safePath = path;
    let duplicateIndex = 2;
    while (usedPaths.has(safePath)) {
      const dot = path.lastIndexOf(".");
      safePath =
        dot === -1
          ? `${path}-${duplicateIndex}`
          : `${path.slice(0, dot)}-${duplicateIndex}${path.slice(dot)}`;
      duplicateIndex += 1;
    }

    usedPaths.add(safePath);
    files.push({ path: safePath, content });
  }

  return files;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9;
  const month = (date.getMonth() + 1) << 5;
  return { date: day | month | date.getDate(), time };
}

function writeUint16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function appendBytes(target: number[], bytes: Uint8Array) {
  for (const byte of bytes) target.push(byte);
}

function createZipBlob(files: ProjectFile[], rootFolder: string) {
  const encoder = new TextEncoder();
  const output: number[] = [];
  const centralDirectory: number[] = [];
  const { date, time } = dosDateTime();

  for (const file of files) {
    const fileName = `${rootFolder}/${file.path}`;
    const nameBytes = encoder.encode(fileName);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);
    const localOffset = output.length;

    writeUint32(output, 0x04034b50);
    writeUint16(output, 20);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, time);
    writeUint16(output, date);
    writeUint32(output, crc);
    writeUint32(output, dataBytes.length);
    writeUint32(output, dataBytes.length);
    writeUint16(output, nameBytes.length);
    writeUint16(output, 0);
    appendBytes(output, nameBytes);
    appendBytes(output, dataBytes);

    writeUint32(centralDirectory, 0x02014b50);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, time);
    writeUint16(centralDirectory, date);
    writeUint32(centralDirectory, crc);
    writeUint32(centralDirectory, dataBytes.length);
    writeUint32(centralDirectory, dataBytes.length);
    writeUint16(centralDirectory, nameBytes.length);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, 0);
    writeUint32(centralDirectory, localOffset);
    appendBytes(centralDirectory, nameBytes);
  }

  const centralOffset = output.length;
  appendBytes(output, new Uint8Array(centralDirectory));

  writeUint32(output, 0x06054b50);
  writeUint16(output, 0);
  writeUint16(output, 0);
  writeUint16(output, files.length);
  writeUint16(output, files.length);
  writeUint32(output, centralDirectory.length);
  writeUint32(output, centralOffset);
  writeUint16(output, 0);

  return new Blob([new Uint8Array(output)], { type: "application/zip" });
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "lika-project";
}

export function downloadProjectZip(markdown: string, title = "lika-project") {
  const files = extractProjectFiles(markdown);
  if (!files.length) return false;

  const folder = slugify(title);
  const blob = createZipBlob(files, folder);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${folder}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return true;
}
