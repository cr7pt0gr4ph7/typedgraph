import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { run } from '../src/cli.mjs';
import '../src/commands/index.mjs';

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-inverses-'));
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(join(dir, p, '..'), { recursive: true });
    writeFileSync(join(dir, p), t);
  }
  return dir;
}

async function tg(cwd: string, ...args: string[]) {
  let out = '';
  let err = '';
  const code = await run(args, { cwd, out: (t) => (out += t), err: (t) => (err += t), env: {} });
  return { code, out, err };
}

const VAULT = {
  'Types/Edges.md': '---\nedgeTypes:\n  worksAt: {inverseEdge: hasEmployee}\n---\n',
  'Ada.md': '- worksAt:: [[Acme]] {role: engineer}\n',
  'Acme.md': '# Acme\n',
};

// @tg: verifies:: [[tests/inverse-edges#tg inverses writes on request]] {level: integration}
it('lists missing ends as a dry run and writes them with --write', async () => {
  const dir = folder(VAULT);
  const dry = await tg(dir, 'inverses');
  expect(dry.code).toBe(1);
  expect(dry.out).toContain('add    Acme.md: - hasEmployee:: [[Ada]] {role: engineer}  (from Ada.md:1)');
  expect(readFileSync(join(dir, 'Acme.md'), 'utf8')).toBe('# Acme\n');
  const wrote = await tg(dir, 'inverses', '--write', '--heading', 'Links');
  expect(wrote.code).toBe(0);
  expect(readFileSync(join(dir, 'Acme.md'), 'utf8')).toBe('# Acme\n\n## Links\n\n- hasEmployee:: [[Ada]] {role: engineer}\n');
  const again = await tg(dir, 'inverses');
  expect(again.code).toBe(0);
  expect(again.out).toContain('Every inverse and symmetric edge is written on both ends.');
});

// @tg: verifies:: [[tests/inverse-edges#tg inverses writes on request]] {level: integration}
it('takes the placement, the two sources of truth and deletions at run time', async () => {
  const dir = folder({ ...VAULT, 'Acme.md': '- hasEmployee:: [[Ada]] {role: manager}\n- hasEmployee:: [[Bob]]\n', 'Bob.md': '' });
  utimesSync(join(dir, 'Ada.md'), 1000, 1000);
  utimesSync(join(dir, 'Bob.md'), 1000, 1000);
  utimesSync(join(dir, 'Acme.md'), 2000, 2000);
  const r = await tg(dir, '--json', 'inverses', '--property-winner', 'last-edited', '--deletions', 'mirror', '--deletion-winner', 'last-edited', '--placement', 'frontmatter');
  const actions = (JSON.parse(r.out) as { actions: { kind: string; path: string }[] }).actions;
  expect(actions.map((a) => [a.kind, a.path]).sort()).toEqual([
    ['add', 'Bob.md'],
    ['update', 'Ada.md'],
  ]);
  await tg(dir, 'inverses', '--write', '--placement', 'frontmatter');
  expect(readFileSync(join(dir, 'Bob.md'), 'utf8')).toBe('---\nworksAt: "[[Acme]]"\n---\n');
  expect((await tg(dir, 'inverses', '--placement', 'sideways')).code).toBe(2);
});
