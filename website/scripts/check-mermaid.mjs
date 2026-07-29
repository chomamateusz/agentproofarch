import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mermaid renders in the browser, so `docusaurus build` never parses a diagram.
// This runs the real grammar in node, where DOMPurify has no DOM and reports
// itself unsupported: mermaid's sanitizer hooks would throw before the parser is
// reached, so the shared module instance gets a pass-through sanitizer. Nothing
// here renders or trusts diagram text — only the grammar is under test.
const DOMPurify = (await import('dompurify')).default;
if (typeof DOMPurify.addHook !== 'function') DOMPurify.addHook = () => {};
if (typeof DOMPurify.sanitize !== 'function') DOMPurify.sanitize = (text) => String(text);

const mermaid = (await import('mermaid')).default;

const websiteRoot = fileURLToPath(new URL('..', import.meta.url));
const roots = ['docs', 'src'];
const MARKDOWN = /\.mdx?$/;
const FENCE = /^([ \t]*)```mermaid[^\n]*\n([\s\S]*?)^\1```/gm;

const markdownFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return MARKDOWN.test(entry.name) ? [path] : [];
    }),
  );
  return found.flat();
};

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

const files = (
  await Promise.all(roots.map((root) => markdownFiles(join(websiteRoot, root))))
).flat();

let diagrams = 0;
const failures = [];

for (const file of files.sort()) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(FENCE)) {
    diagrams += 1;
    try {
      await mermaid.parse(match[2]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/DOMPurify|addHook|sanitize/i.test(message)) {
        process.stderr.write(
          `check-mermaid cannot run: the sanitizer shim no longer matches mermaid's ` +
            `bundled DOMPurify (${message}). Fix the harness — this is not a diagram error.\n`,
        );
        process.exit(2);
      }
      failures.push({ file: relative(websiteRoot, file), line: lineOf(source, match.index), message });
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(
      `\n${failure.file}:${failure.line} — mermaid parse failed\n${failure.message}\n`,
    );
  }
  process.stderr.write(
    `\ncheck-mermaid: ${failures.length} of ${diagrams} diagram(s) failed to parse\n`,
  );
  process.exit(1);
}

process.stdout.write(`check-mermaid: ${diagrams} diagrams in ${files.length} files parse clean\n`);
