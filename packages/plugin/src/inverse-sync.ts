import { applyInverseEdits, canonicalType, edgeSemantics, isPlain, planInverseSync, type DeletionPolicy, type Graph, type InverseAction, type InversePlacement, type MismatchWinner, type SchemaSet } from '@obsigraph/core';

/** The inverse-edge options as the plugin stores them. */
export interface InverseSettings {
  inverseOnSave: boolean;
  inversePlacement: InversePlacement;
  inverseHeading: string;
  inverseWinner: MismatchWinner;
  inverseDeletions: DeletionPolicy;
}

/** What the sync needs from the vault, so it runs the same in Obsidian and in tests. */
export interface SyncFiles {
  read(path: string): Promise<string | null>;
  mtime(path: string): number | null;
  /** Rewrite a note from its current text; the function receives that text. */
  process(path: string, fn: (text: string) => string): Promise<void>;
}

export interface SyncResult {
  actions: InverseAction[];
  /** Notes written. */
  written: string[];
}

/**
 * Keep both ends of inverse and symmetric edges written, with the plugin's settings: read the notes
 * the plan needs, plan with {@link planInverseSync}, then rewrite each changed note from its current
 * text, so an edit made in between is kept and the edits it invalidates are dropped.
 */
// @tg: implements:: [[openspec:schema-notes#Maintain inverse edges]]
export async function syncInverseEdges(graph: Graph, set: SchemaSet, files: SyncFiles, settings: InverseSettings, only?: ReadonlySet<string>): Promise<SyncResult> {
  const sem = edgeSemantics(set);
  if (isPlain(sem)) return { actions: [], written: [] };
  // The planner reads the lines of the edges it may touch: both ends of every paired edge in scope.
  const need = new Set<string>();
  for (const e of graph.edges()) {
    const { type } = canonicalType(e.type, sem);
    if (!sem.symmetric.has(type) && !sem.inverseName.has(type)) continue;
    if (only && !only.has(e.source) && !only.has(e.target)) continue;
    need.add(e.source);
    need.add(e.target);
  }
  const texts = new Map<string, string>();
  for (const p of need) {
    const t = await files.read(p);
    if (t !== null) texts.set(p, t);
  }
  const plan = planInverseSync(graph, set, (p) => texts.get(p) ?? null, {
    placement: settings.inversePlacement,
    heading: settings.inverseHeading,
    winner: settings.inverseWinner,
    deletions: settings.inverseDeletions,
    mtime: (p) => files.mtime(p),
    only,
  });
  const written: string[] = [];
  for (const [path, edits] of plan.edits) {
    await files.process(path, (text) => applyInverseEdits(text, edits).text);
    written.push(path);
  }
  return { actions: plan.actions, written };
}

/**
 * Runs a sync for the notes saved since the last run, after a pause, and never for its own writes,
 * so saving a note keeps the notes it links to in step without a loop.
 */
export class OnSaveSync {
  private pending = new Set<string>();
  private own = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly run: (only: ReadonlySet<string>) => Promise<SyncResult>,
    private readonly delayMs: () => number,
  ) {}

  /** A note changed in the graph. */
  changed(paths: Iterable<string>): void {
    for (const p of paths) {
      if (this.own.delete(p)) continue;
      this.pending.add(p);
    }
    if (!this.pending.size) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs());
  }

  async flush(): Promise<SyncResult | null> {
    this.timer = null;
    if (!this.pending.size) return null;
    const only = this.pending;
    this.pending = new Set();
    const r = await this.run(only);
    for (const p of r.written) this.own.add(p);
    return r;
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }
}
