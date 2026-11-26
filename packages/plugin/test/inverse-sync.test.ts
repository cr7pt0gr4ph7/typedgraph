import { describe, expect, it, vi } from 'vitest';
import { Graph, schemasFromGraph, splitFrontmatter } from '@obsigraph/core';
import { parse as parseYaml } from 'yaml';
import { OnSaveSync, syncInverseEdges, type InverseSettings, type SyncFiles } from '../src/inverse-sync';

const SETTINGS: InverseSettings = { inverseOnSave: true, inversePlacement: 'heading', inverseHeading: 'Relations', inversePropertyWinner: 'declared', inverseDeletionWinner: 'declared', inverseDeletions: 'keep' };

function vault(files: Record<string, string>) {
  const texts = new Map(Object.entries({ 'Types/Edges.md': '---\nedgeTypes:\n  worksAt: {inverseEdge: hasEmployee}\n---\n', ...files }));
  const paths = [...texts.keys()];
  const graph = new Graph((l) => paths.find((p) => p === `${l}.md`) ?? null);
  const upsert = (path: string) => graph.upsertNote({ path, text: texts.get(path)!, frontmatter: (parseYaml(splitFrontmatter(texts.get(path)!).yaml ?? '') as Record<string, unknown>) ?? null });
  for (const p of paths) upsert(p);
  const io: SyncFiles = {
    read: async (p) => texts.get(p) ?? null,
    mtime: () => null,
    process: async (p, fn) => {
      texts.set(p, fn(texts.get(p)!));
      upsert(p);
    },
  };
  return { texts, graph, io, set: () => schemasFromGraph(graph, 'Types/') };
}

describe('inverse edge sync in the plugin', () => {
  // @tg: verifies:: [[tests/inverse-edges#Plugin writes inverse edges on command and on save]] {level: unit}
  it('writes the missing ends with the plugin settings, limited to the saved notes', async () => {
    const v = vault({ 'Ada.md': '- worksAt:: [[Acme]]\n', 'Bob.md': '- worksAt:: [[Acme]]\n', 'Acme.md': '# Acme\n' });
    const r = await syncInverseEdges(v.graph, v.set(), v.io, SETTINGS, new Set(['Ada.md']));
    expect(r.written).toEqual(['Acme.md']);
    expect(v.texts.get('Acme.md')).toBe('# Acme\n\n## Relations\n\n- hasEmployee:: [[Ada]]\n');
    await syncInverseEdges(v.graph, v.set(), v.io, { ...SETTINGS, inversePlacement: 'end' });
    expect(v.texts.get('Acme.md')).toBe('# Acme\n\n## Relations\n\n- hasEmployee:: [[Ada]]\n- hasEmployee:: [[Bob]]\n');
  });

  // @tg: verifies:: [[tests/inverse-edges#Plugin writes inverse edges on command and on save]] {level: unit}
  it('runs once the saves pause, for the saved notes only, and not for its own writes', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async (only: ReadonlySet<string>) => ({ actions: [], written: only.has('Ada.md') ? ['Acme.md'] : [] }));
    const sync = new OnSaveSync(run, () => 1000);
    sync.changed(['Ada.md']);
    sync.changed(['Ada.md', 'Bob.md']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    expect([...run.mock.calls[0]![0]]).toEqual(['Ada.md', 'Bob.md']);
    sync.changed(['Acme.md']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    sync.changed(['Acme.md']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
