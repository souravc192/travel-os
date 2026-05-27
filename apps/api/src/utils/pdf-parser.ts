import pdfParse from 'pdf-parse';

// ─── Parsed tree node ─────────────────────────────────────────
// Each node is a card. Nested children render as indented sub-cards.
export interface PolicyNode {
  id:       string;          // stable per-version id (e.g. "1.2.3")
  heading:  string;          // displayed title (with the numbering)
  level:    number;          // 1 for "1.", 2 for "1.1", 3 for "1.1.1", …
  body:     string;          // section text (verbatim, with sub-section text excluded)
  children: PolicyNode[];
}

export interface ParseResult {
  raw_text: string;
  tree:     PolicyNode[];    // top-level nodes
  fallback: boolean;         // true when no numbered headings were detected
  meta: {
    pages:        number;
    headingCount: number;
  };
}

// Matches lines like:
//   1. Travel Policy
//   1.1 Eligibility
//   1.1.1 Grade-L1
//   1) Travel Policy
//   1.1. Eligibility
//
// Trailing dot/paren is optional. Heading text must follow on the SAME line.
const HEADING_RE = /^\s*(\d+(?:\.\d+){0,4})[.)]?\s+(.{2,160})$/;

// Lines that look like page numbers or page-break artefacts
const NOISE_RE  = /^\s*(?:page\s*)?\d+\s*(?:of\s*\d+)?\s*$/i;

function extractLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0 && !NOISE_RE.test(l));
}

interface LineHit {
  numbering: string;   // "1.2"
  level:     number;
  heading:   string;
  bodyStart: number;   // index of first body line for this section
}

function findHeadings(lines: string[]): LineHit[] {
  const hits: LineHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;
    // Filter false positives: a line that's actually a list item often has
    // the body text very short or followed by another list item.
    // Heuristic: heading text shouldn't end in a comma or open bracket.
    const heading = m[2].trim();
    if (/[,(]$/.test(heading)) continue;
    const numbering = m[1];
    const level = numbering.split('.').length;
    hits.push({ numbering, level, heading, bodyStart: i + 1 });
  }
  return hits;
}

function buildTree(hits: LineHit[], lines: string[]): PolicyNode[] {
  const flat: PolicyNode[] = hits.map((h, i) => {
    const next = hits[i + 1];
    const bodyEnd = next ? next.bodyStart - 1 : lines.length;
    const body = lines.slice(h.bodyStart, bodyEnd).join('\n').trim();
    return {
      id:       h.numbering,
      heading:  `${h.numbering}  ${h.heading}`,
      level:    h.level,
      body,
      children: [],
    };
  });

  // Roll up into hierarchy. Stack-based — works for arbitrary depth.
  const roots: PolicyNode[] = [];
  const stack: PolicyNode[] = [];
  for (const node of flat) {
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  // To honour "show only this section's text" (parent body should NOT include
  // child text), strip child bodies from parent body. The simplest approach:
  // when a child exists, the parent body is whatever the original `flat` slice
  // captured BEFORE the first child's body started. We re-derive precisely.
  // Build a map numbering → original bodyStart from `hits`.
  const startByNumbering = new Map(hits.map((h) => [h.numbering, h.bodyStart]));

  function trimParentBody(n: PolicyNode) {
    if (n.children.length === 0) return;
    const firstChildStart = startByNumbering.get(n.children[0].id);
    const myStart         = startByNumbering.get(n.id);
    if (firstChildStart !== undefined && myStart !== undefined) {
      // Body line range is [myStart, firstChildHeadingLine).
      // First child's heading lives at firstChildStart - 1.
      const parentBodyEnd = Math.max(myStart, firstChildStart - 1);
      n.body = lines.slice(myStart, parentBodyEnd).join('\n').trim();
    }
    n.children.forEach(trimParentBody);
  }
  roots.forEach(trimParentBody);
  return roots;
}

// ─── Public API ──────────────────────────────────────────────
export async function parsePolicyPdf(buf: Buffer): Promise<ParseResult> {
  const parsed = await pdfParse(buf);
  const lines = extractLines(parsed.text ?? '');
  const hits  = findHeadings(lines);

  if (hits.length === 0) {
    return {
      raw_text: parsed.text ?? '',
      tree: [{
        id:       'all',
        heading:  'Policy',
        level:    1,
        body:     lines.join('\n'),
        children: [],
      }],
      fallback: true,
      meta: { pages: parsed.numpages ?? 0, headingCount: 0 },
    };
  }

  return {
    raw_text: parsed.text ?? '',
    tree:     buildTree(hits, lines),
    fallback: false,
    meta:     { pages: parsed.numpages ?? 0, headingCount: hits.length },
  };
}

// ─── Re-parse a stored raw_text without needing the PDF buffer ──
// Used by admin re-parse (no need to re-upload the file).
export function reparsePolicyText(text: string): ParseResult {
  const lines = extractLines(text);
  const hits  = findHeadings(lines);
  if (hits.length === 0) {
    return {
      raw_text: text,
      tree: [{ id: 'all', heading: 'Policy', level: 1, body: lines.join('\n'), children: [] }],
      fallback: true,
      meta: { pages: 0, headingCount: 0 },
    };
  }
  return {
    raw_text: text,
    tree:     buildTree(hits, lines),
    fallback: false,
    meta:     { pages: 0, headingCount: hits.length },
  };
}
