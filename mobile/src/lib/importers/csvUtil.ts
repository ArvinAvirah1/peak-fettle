/**
 * csvUtil — tiny, dependency-free CSV tokenizer shared by strongCsv.ts and
 * hevyCsv.ts. No CSV library is installed in mobile/package.json and this
 * ticket's file-ownership rules forbid touching package.json, so a minimal
 * RFC4180-ish parser lives here instead of pulling in a new dependency.
 *
 * Handles: quoted fields ("a, b"), escaped quotes ("" inside a quoted field),
 * \r\n / \n line endings, and a trailing blank line. Does NOT handle embedded
 * newlines inside a quoted field spanning multiple physical lines from a
 * naive line-split — parseCsv() below splits on newlines only OUTSIDE quotes
 * so that case is covered too.
 */

/**
 * Split raw CSV text into rows of string cells. Pure/deterministic — no clock
 * or random reads.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Normalize CRLF up front so \r never leaks into a field value.
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const len = src.length;

  for (let i = 0; i < len; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
  }
  // Flush the last field/row (files may or may not end with a newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-blank trailing rows (a single '' cell from a trailing newline).
  while (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.length === 1 && last[0]!.trim() === '') {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}

/** Build a header-name → column-index map, case/space-insensitive on lookup
 * via `col()` below. Keeps the ORIGINAL header text for signature detection. */
export function headerIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((h, i) => {
    map.set(normalizeHeaderKey(h), i);
  });
  return map;
}

function normalizeHeaderKey(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_]+/g, '');
}

/** Read a cell by header name (tolerant of case/space/underscore variants and
 * column reordering/extras — spec: "tolerate column reordering/extras"). */
export function col(
  row: string[],
  index: Map<string, number>,
  name: string,
): string | undefined {
  const idx = index.get(normalizeHeaderKey(name));
  if (idx == null) return undefined;
  return row[idx];
}

/** Parse a numeric cell, tolerating blank/missing → null. */
export function parseNum(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Parse an integer cell, tolerating blank/missing → null. */
export function parseInt10(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

/** True when a header row contains ALL of the given (normalized) column names.
 * Used for format auto-detection — tolerant of extra/reordered columns. */
export function headerHasAll(header: string[], required: string[]): boolean {
  const idx = headerIndex(header);
  return required.every((name) => idx.has(normalizeHeaderKey(name)));
}
