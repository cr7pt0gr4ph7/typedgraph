import { parseProps, type Props, type PropValue } from '../edges/props.js';
import { titleOf, type Graph } from '../graph/graph.js';
import { canonicalType, canonicalView, edgeSemantics, isPlain, nameFrom } from './inverse.js';
import type { SchemaSet } from './schema.js';

/** Where a missing inverse side is written in the other note. */
export type InversePlacement = 'heading' | 'end' | 'frontmatter';
/** Which end is the source of truth: the end written with the declared name, or the end in the more recently modified note. */
export type SourceOfTruth = 'declared' | 'last-edited';
/** What happens to a line the maintainer wrote once the edge it mirrors is gone. */
export type DeletionPolicy = 'keep' | 'mirror';

export interface InverseSyncOptions {
  /** Default `heading`. */
  placement?: InversePlacement;
  /** Heading the `heading` placement writes under, created at the end of the note when missing; default `Relations`. */
  heading?: string;
  /** Whose properties are kept when the two ends of one edge differ; default `declared`. */
  propertyWinner?: SourceOfTruth;
  /**
   * With `deletions: mirror`, whether a lone end is new (its other end is added) or left over from a
   * deleted edge (it is removed); default `declared`.
   */
  deletionWinner?: SourceOfTruth;
  /** Default `keep`: lone ends are always completed and nothing is removed. */
  deletions?: DeletionPolicy;
  /** Modification time of a note, for `last-edited`; null when unknown. */
  mtime?: (path: string) => number | null;
  /** Only act on edges written in these notes (and on maintainer lines that mirror them), e.g. the note just saved. */
  only?: ReadonlySet<string>;
}

export const DEFAULT_INVERSE_HEADING = 'Relations';

/** One edit to a note, made on the text it was planned from. */
export type InverseEdit =
  | { op: 'replace'; line: number; expect: string; text: string }
  | { op: 'remove'; line: number; expect: string }
  | { op: 'append'; placement: 'heading' | 'end'; heading: string; text: string }
  | { op: 'frontmatter'; key: string; value: string };

/** What a sync does, or would do, for people to read. */
export interface InverseAction {
  kind: 'add' | 'update' | 'remove' | 'skip';
  /** The note that changes, or that would. */
  path: string;
  /** 0-based line in `path` for `update` and `remove`. */
  line: number | null;
  /** The line written, or the reason for a skip. */
  text: string;
  /** The edge that causes it: where it is written, 0-based line. */
  cause: { path: string; line: number };
}

export interface InversePlan {
  actions: InverseAction[];
  /** Edits per note path, to apply with {@link applyInverseEdits}. */
  edits: Map<string, InverseEdit[]>;
}

const isNotePath = (p: string) => p.endsWith('.md') && !p.includes('#');

/**
 * Plan how to keep both ends of inverse and symmetric edges written (TGS 0.7): add the missing end of
 * each edge to the note at its other end and rewrite the properties of the end that loses a mismatch.
 * With `deletions: mirror`, a lone end that the `deletionWinner` rule finds left over is removed instead: under
 * `declared`, an end written with the inverse name (its declared end was deleted); under `last-edited`,
 * an end whose other note changed after its own. Only Markdown notes take part; edge notes, sections,
 * stubs and AsciiDoc notes are skipped. Nothing is written here.
 */
// @tg: implements:: [[openspec:schema-notes#Maintain inverse edges]]
export function planInverseSync(graph: Graph, set: SchemaSet, text: (path: string) => string | null, opts: InverseSyncOptions = {}): InversePlan {
  const plan: InversePlan = { actions: [], edits: new Map() };
  const sem = edgeSemantics(set);
  if (isPlain(sem)) return plan;
  const placement = opts.placement ?? 'heading';
  const heading = opts.heading?.trim() || DEFAULT_INVERSE_HEADING;
  const propertyWinner = opts.propertyWinner ?? 'declared';
  const deletionWinner = opts.deletionWinner ?? 'declared';
  const deletions = opts.deletions ?? 'keep';
  const inScope = (p: string) => !opts.only || opts.only.has(p);
  const edit = (path: string, e: InverseEdit) => (plan.edits.get(path) ?? plan.edits.set(path, []).get(path)!).push(e);
  const act = (a: InverseAction) => plan.actions.push(a);

  const lines = new Map<string, string[]>();
  const lineOf = (path: string, n: number): string | null => {
    if (!lines.has(path)) lines.set(path, text(path)?.split(/\r?\n/) ?? []);
    return lines.get(path)![n] ?? null;
  };

  // The two written ends of each merged edge.
  const view = canonicalView(graph, set);
  const partner = new Map<string, string>();
  const declaredSide = new Set<string>();
  for (const v of view.edges()) {
    const other = v.merged?.[0];
    if (!other) continue;
    partner.set(v.id, other);
    partner.set(other, v.id);
    declaredSide.add(v.id);
  }

  const titles = new Map<string, number>();
  for (const n of graph.nodes()) if (!n.stub) titles.set(titleOf(n.id).toLowerCase(), (titles.get(titleOf(n.id).toLowerCase()) ?? 0) + 1);
  const linkTo = (path: string) => (titles.get(titleOf(path).toLowerCase()) === 1 ? titleOf(path) : path.replace(/\.md$/, ''));

  for (const w of graph.edges()) {
    if (w.file || !isNotePath(w.source)) continue;
    const { type, reversed } = canonicalType(w.type, sem);
    if (!sem.symmetric.has(type) && !sem.inverseName.has(type)) continue;
    const written = lineOf(w.source, w.line);
    if (written === null) continue;
    const inFrontmatter = (e: { line: number }, l: string | null) => e.line === 0 && l?.trim() === '---';
    const cause = { path: w.source, line: w.line };
    const other = partner.get(w.id);

    if (other) {
      // A mismatch is fixed once per pair, from its declared side.
      if (!declaredSide.has(w.id)) continue;
      const o = graph.edge(other)!;
      // Frontmatter edges hold no properties, so a pair with a frontmatter end has nothing to fix.
      if (inFrontmatter(w, written) || inFrontmatter(o, lineOf(o.source, o.line))) continue;
      if (samePropsBut(w.props, o.props)) continue;
      if (!inScope(w.source) && !inScope(o.source)) continue;
      let [win, lose] = [w, o];
      if (propertyWinner === 'last-edited') {
        const tw = opts.mtime?.(w.source) ?? null;
        const to = opts.mtime?.(o.source) ?? null;
        if (tw !== null && to !== null && to > tw) [win, lose] = [o, w];
      }
      const was = lineOf(lose.source, lose.line);
      const next = was === null ? null : withProps(was, { ...stripId(win.props), ...(lose.props.id !== undefined ? { id: lose.props.id } : {}) });
      if (next === null) act({ kind: 'skip', path: lose.source, line: lose.line, text: 'properties differ, but the losing end is not a single-link edge line', cause: { path: win.source, line: win.line } });
      else {
        edit(lose.source, { op: 'replace', line: lose.line, expect: was!, text: next });
        act({ kind: 'update', path: lose.source, line: lose.line, text: next, cause: { path: win.source, line: win.line } });
      }
      continue;
    }

    const target = graph.node(w.target);
    if (deletions === 'mirror' && target && !target.stub && isNotePath(w.target) && w.target !== w.source && leftOver(w, reversed, sem.symmetric.has(type), deletionWinner, opts.mtime)) {
      if (!inScope(w.source) && !inScope(w.target)) continue;
      if (inFrontmatter(w, written) || linkCount(written) !== 1) act({ kind: 'skip', path: w.source, line: w.line, text: 'the other end was deleted, but this end is not a single-link edge line', cause });
      else {
        edit(w.source, { op: 'remove', line: w.line, expect: written });
        act({ kind: 'remove', path: w.source, line: w.line, text: written, cause });
      }
      continue;
    }

    if (!inScope(w.source)) continue;
    if (!target || target.stub || !isNotePath(w.target) || w.target === w.source) {
      if (target && !target.stub && w.target !== w.source) act({ kind: 'skip', path: w.target, line: null, text: 'the other end is not a Markdown note', cause });
      continue;
    }
    const name = nameFrom(w, w.target, sem);
    const link = `[[${linkTo(w.source)}]]`;
    if (placement === 'frontmatter') {
      if (w.sign < 0) {
        act({ kind: 'skip', path: w.target, line: null, text: 'a denied edge cannot be written in frontmatter', cause });
        continue;
      }
      edit(w.target, { op: 'frontmatter', key: name, value: `"${link}"` });
      act({ kind: 'add', path: w.target, line: null, text: `${name}: "${link}"${Object.keys(stripId(w.props)).length ? ' (properties are not kept in frontmatter)' : ''}`, cause });
      continue;
    }
    const props = formatProps(stripId(w.props));
    const line = `- ${w.sign < 0 ? '-' : ''}${name}:: ${link}${props ? ` ${props}` : ''}`;
    edit(w.target, { op: 'append', placement, heading, text: line });
    act({ kind: 'add', path: w.target, line: null, text: line, cause });
  }
  return plan;
}

/**
 * Apply planned edits to the text they were planned from. An edit whose line no longer holds the
 * expected text is left out and counted in `stale`, so a note changed in between is never damaged.
 */
// @tg: implements:: [[openspec:schema-notes#Maintain inverse edges]]
export function applyInverseEdits(text: string, edits: readonly InverseEdit[]): { text: string; stale: number } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines: (string | null)[] = text.split(/\r?\n/);
  let stale = 0;
  for (const e of edits) {
    if (e.op !== 'replace' && e.op !== 'remove') continue;
    if (lines[e.line] !== e.expect) {
      stale++;
      continue;
    }
    lines[e.line] = e.op === 'replace' ? e.text : null;
  }
  let out = lines.filter((l): l is string => l !== null);
  for (const e of edits) if (e.op === 'append') out = e.placement === 'end' ? appendAtEnd(out, e.text) : appendUnderHeading(out, e.heading, e.text);
  for (const e of edits) if (e.op === 'frontmatter') out = addFrontmatterLink(out, e.key, e.value);
  return { text: out.join(eol), stale };
}

/**
 * Whether a lone end is left over from a deleted edge rather than new. Under `declared`, an end written
 * with the inverse name is left over (a symmetric type has no declared end, so never). Under
 * `last-edited`, it is left over when the note at its other end changed after the note holding it.
 */
function leftOver(w: { source: string; target: string }, reversed: boolean, symmetric: boolean, winner: SourceOfTruth, mtime?: (path: string) => number | null): boolean {
  if (winner === 'declared') return reversed && !symmetric;
  const own = mtime?.(w.source) ?? null;
  const other = mtime?.(w.target) ?? null;
  return own !== null && other !== null && other > own;
}

function stripId(p: Props): Props {
  const { id: _id, ...rest } = p;
  return rest;
}

function samePropsBut(a: Props, b: Props): boolean {
  const x = stripId(a);
  const y = stripId(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return false;
  return true;
}

const BARE = /^[A-Za-z_][\w]*$/;
function formatValue(v: PropValue): string {
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  if (typeof v === 'string') return BARE.test(v) && !['true', 'false', 'null'].includes(v) ? v : JSON.stringify(v);
  return String(v);
}

/** A property block in edge syntax, `{role: engineer, since: "2020-01"}`, or '' for no properties. */
export function formatProps(p: Props): string {
  const entries = Object.entries(p);
  if (!entries.length) return '';
  return `{${entries.map(([k, v]) => `${BARE.test(k) ? k : JSON.stringify(k)}: ${formatValue(v)}`).join(', ')}}`;
}

/** Where the link of an edge line ends, and whether more links follow; null when the line is not a single edge line. */
function linkEnd(line: string): { end: number; more: boolean } | null {
  const m = /^\s*(?:[-*+]\s+)?[+-]?[^\s:{}[\]]+::\s*/.exec(line);
  if (!m) return null;
  let i = m[0].length;
  if (line.startsWith('[[', i)) {
    const j = line.indexOf(']]', i);
    if (j < 0) return null;
    i = j + 2;
  } else if (line[i] === '[') {
    const j = line.indexOf('](', i);
    const k = j < 0 ? -1 : line.indexOf(')', j);
    if (k < 0) return null;
    i = k + 1;
  } else return null;
  return { end: i, more: /^\s*,/.test(line.slice(i)) };
}

function linkCount(line: string): number {
  const l = linkEnd(line);
  return !l ? 0 : l.more ? 2 : 1;
}

/** The edge line with its property block replaced; null when it is not a single-link edge line. */
function withProps(line: string, props: Props): string | null {
  const l = linkEnd(line);
  if (!l || l.more) return null;
  let rest = line.slice(l.end);
  const lead = rest.length - rest.trimStart().length;
  if (rest.trimStart().startsWith('{')) {
    try {
      const { end } = parseProps(rest, lead);
      rest = rest.slice(end);
    } catch {
      return null;
    }
  }
  const block = formatProps(props);
  return `${line.slice(0, l.end)}${block ? ` ${block}` : ''}${rest}`;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const ITEM = /^\s*[-*+]\s/;

function appendAtEnd(lines: string[], item: string): string[] {
  const out = [...lines];
  while (out.length && out[out.length - 1] === '') out.pop();
  if (out.length && !ITEM.test(out[out.length - 1]!)) out.push('');
  out.push(item, '');
  return out;
}

function appendUnderHeading(lines: string[], heading: string, item: string): string[] {
  const want = heading.toLowerCase();
  let fence = false;
  let at = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i]!)) fence = !fence;
    if (fence) continue;
    const h = HEADING.exec(lines[i]!);
    if (h && h[2]!.toLowerCase() === want) {
      at = i;
      level = h[1]!.length;
      break;
    }
  }
  if (at < 0) {
    const out = [...lines];
    while (out.length && out[out.length - 1] === '') out.pop();
    return [...out, ...(out.length ? [''] : []), `## ${heading}`, '', item, ''];
  }
  let end = lines.length;
  fence = false;
  for (let i = at + 1; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i]!)) fence = !fence;
    const h = !fence && HEADING.exec(lines[i]!);
    if (h && h[1]!.length <= level) {
      end = i;
      break;
    }
  }
  let last = end - 1;
  while (last > at && lines[last]!.trim() === '') last--;
  const out = [...lines];
  if (last === at) out.splice(at + 1, 0, '', item, ...(end < lines.length && lines[at + 1]?.trim() !== '' ? [''] : []));
  else out.splice(last + 1, 0, ...(ITEM.test(lines[last]!) ? [] : ['']), item);
  return out;
}

/** Add `value` to the frontmatter property `key`: a new key, a scalar turned into a list, or one more list item. */
function addFrontmatterLink(lines: string[], key: string, value: string): string[] {
  const out = [...lines];
  if (out[0] !== '---') return ['---', `${key}: ${value}`, '---', ...out];
  let close = out.findIndex((l, i) => i > 0 && (l === '---' || l === '...'));
  if (close < 0) return out;
  const k = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(.*)$`);
  const i = out.findIndex((l, n) => n > 0 && n < close && k.test(l));
  if (i < 0) {
    out.splice(close, 0, `${key}: ${value}`);
    return out;
  }
  const rest = k.exec(out[i]!)![1]!.trim();
  if (rest === '') {
    let j = i + 1;
    while (j < close && /^\s+-\s/.test(out[j]!)) j++;
    out.splice(j, 0, `  - ${value}`);
  } else if (rest.startsWith('[') && rest.endsWith(']')) {
    const inner = rest.slice(1, -1).trim();
    out[i] = `${key}: [${inner ? `${inner}, ` : ''}${value}]`;
  } else {
    out.splice(i, 1, `${key}:`, `  - ${rest}`, `  - ${value}`);
    close += 2;
  }
  return out;
}


