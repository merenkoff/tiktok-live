// Turns the human guides in TechDocs/guides/*.md into the `virtual:guides`
// module at build time, so the Markdown stays the one copy and the site ships
// HTML instead of a Markdown parser. Conventions the files follow:
//   - the first `# ` line is the page title (the page renders its own <h1>);
//   - the «Посібники: … · …» switcher line and the `---` after it are dropped
//     (ArticlePage draws its own switcher);
//   - a file with `# Частина …` parts shifts every heading one level down;
//   - `## Часті питання` (`**Q**` + answer lines) is cut from the body and
//     becomes the FAQ, which ArticlePage renders and FAQPage JSON-LD reads;
//   - links between guides are relative `other.md` and become `/dovidka/other`.
import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const GUIDES_DIR = fileURLToPath(new URL('../../TechDocs/guides/', import.meta.url));
const VIRTUAL_ID = 'virtual:guides';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const FAQ_HEADING = /^##\s+Часті питання\s*$/m;
const WORDS_PER_MINUTE = 180;

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y',
  і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu',
  я: 'ia', ы: 'y', э: 'e', ё: 'io', ъ: '',
};

function slugify(text) {
  return [...text.toLowerCase()]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Markdown inline → plain text, for FAQ answers (JSON-LD wants text) and heading labels. */
function plain(md) {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function parseFaq(md, file) {
  const items = [];
  for (const block of md.split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    if (!lines[0]) continue;
    const q = lines[0].match(/^\*\*(.+)\*\*$/);
    if (!q || lines.length < 2) {
      throw new Error(`guides: ${file}: FAQ entry must be "**question**" followed by the answer, got: ${lines[0]}`);
    }
    items.push({ q: plain(q[1]), a: plain(lines.slice(1).join(' ')) });
  }
  return items;
}

function convert(file, source, slugs) {
  let md = source.replace(/\r\n/g, '\n');

  const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title) throw new Error(`guides: ${file}: no "# title" line`);
  md = md.replace(/^#\s+.+\n/m, '');
  // The switcher line and its rule.
  md = md.replace(/^\s*Посібники:.*\n+(---\n)?/m, '');

  let faq = [];
  const faqAt = md.search(FAQ_HEADING);
  if (faqAt !== -1) {
    faq = parseFaq(md.slice(faqAt).replace(FAQ_HEADING, ''), file);
    md = md.slice(0, faqAt).replace(/\n---\s*\n*$/, '\n');
  }

  const shift = /^#\s/m.test(md) ? 1 : 0;
  const headings = [];
  const usedIds = new Set();
  const marked = new Marked({
    walkTokens(token) {
      if (token.type === 'link' && /^[^/:#]+\.md(#.*)?$/.test(token.href)) {
        const [target, hash] = token.href.split('#');
        const slug = basename(target, '.md');
        if (!slugs.has(slug)) throw new Error(`guides: ${file}: link to unknown guide ${token.href}`);
        token.href = `/dovidka/${slug}${hash ? `#${hash}` : ''}`;
      }
    },
    renderer: {
      heading({ tokens, depth, text }) {
        const level = Math.min(depth + shift, 6);
        let id = slugify(plain(text)) || 'section';
        for (let n = 2; usedIds.has(id); n++) id = `${slugify(plain(text))}-${n}`;
        usedIds.add(id);
        if (level <= 3) headings.push({ id, text: plain(text), level });
        return `<h${level} id="${id}">${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
    },
  });
  const html = marked.parse(md.trim());

  const words = (md + faq.map((f) => `${f.q} ${f.a}`).join(' ')).split(/\s+/).filter(Boolean).length;
  return { title, html, faq, headings, readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

export function guidesPlugin() {
  return {
    name: 'guides',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const files = (await readdir(GUIDES_DIR)).filter((f) => f.endsWith('.md')).sort();
      const slugs = new Set(files.map((f) => basename(f, '.md')));
      const out = {};
      for (const file of files) {
        const path = join(GUIDES_DIR, file);
        this.addWatchFile(path);
        out[basename(file, '.md')] = convert(file, await readFile(path, 'utf-8'), slugs);
      }
      return `export default ${JSON.stringify(out)};`;
    },
  };
}
