import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  applyInverseEdits,
  DEFAULT_INVERSE_HEADING,
  DEFAULT_SCHEMA_FOLDER,
  Graph,
  normalizeFolder,
  pathResolver,
  planInverseSync,
  schemasFromGraph,
  type DeletionPolicy,
  type InversePlacement,
  type MismatchWinner,
  type NoteInput,
} from '@obsigraph/core';
import { listNotes, parseYaml, readNote } from '@obsigraph/node-vault';
import { EXIT_ERROR, EXIT_FINDINGS, EXIT_OK, register, type Command, type Ctx } from '../cli.mjs';

const USAGE = 'inverses [--vault dir] [--schema-folder Types] [--write] [--placement heading|end|frontmatter] [--heading Relations] [--winner declared|last-edited] [--deletions keep|mirror] [--json]';

const str = (flags: Map<string, string | true>, k: string) => (typeof flags.get(k) === 'string' ? (flags.get(k) as string) : undefined);

function choice<T extends string>(ctx: Ctx, flags: Map<string, string | true>, key: string, allowed: readonly T[], fallback: T): T | null {
  const v = str(flags, key) ?? fallback;
  if ((allowed as readonly string[]).includes(v)) return v as T;
  ctx.err(`unknown --${key} "${v}"; expected ${allowed.join(', ')}\n`);
  return null;
}

/**
 * Keep both ends of inverse and symmetric edges written in a vault: list what is missing or differs,
 * and with `--write` add the missing ends, fix mismatches and, with `--deletions mirror`, remove ends
 * left over from deleted edges. A dry run by default; exit 1 when a dry run finds something to do.
 */
// @tg: implements:: [[openspec:schema-notes#Maintain inverse edges]]
// @lat: [[cli#Inverse edges]]
async function runInverses(ctx: Ctx, flags: Map<string, string | true>): Promise<number> {
  const placement = choice<InversePlacement>(ctx, flags, 'placement', ['heading', 'end', 'frontmatter'], 'heading');
  const winner = choice<MismatchWinner>(ctx, flags, 'winner', ['declared', 'last-edited'], 'declared');
  const deletions = choice<DeletionPolicy>(ctx, flags, 'deletions', ['keep', 'mirror'], 'keep');
  if (!placement || !winner || !deletions) return EXIT_ERROR;
  const vault = resolve(ctx.cwd, str(flags, 'vault') ?? '.');
  if (!existsSync(vault) || !statSync(vault).isDirectory()) {
    ctx.err(`${vault} is not a directory\n`);
    return EXIT_ERROR;
  }
  const notes: NoteInput[] = await Promise.all((await listNotes(vault)).map(async (f) => (await readNote(vault, f.path)).note));
  const paths = notes.map((n) => n.path);
  // Frontmatter placement writes links there, so they must be read as edges to count as written.
  const graph = new Graph(pathResolver(() => paths), undefined, { frontmatterEdges: placement === 'frontmatter' || flags.has('frontmatter-edges'), parseYaml });
  for (const n of notes) graph.upsertNote(n);
  const set = schemasFromGraph(graph, normalizeFolder(str(flags, 'schema-folder') ?? DEFAULT_SCHEMA_FOLDER));
  const texts = new Map(notes.map((n) => [n.path, n.text]));
  const plan = planInverseSync(graph, set, (p) => texts.get(p) ?? null, {
    placement,
    heading: str(flags, 'heading') ?? DEFAULT_INVERSE_HEADING,
    winner,
    deletions,
    mtime: (p) => {
      try {
        return statSync(join(vault, ...p.split('/'))).mtimeMs;
      } catch {
        return null;
      }
    },
  });
  const write = flags.has('write');
  let stale = 0;
  if (write)
    for (const [path, edits] of plan.edits) {
      const r = applyInverseEdits(texts.get(path)!, edits);
      stale += r.stale;
      writeFileSync(join(vault, ...path.split('/')), r.text);
    }
  const changes = plan.actions.filter((a) => a.kind !== 'skip');
  if (ctx.json) ctx.out(`${JSON.stringify({ written: write, files: plan.edits.size, actions: plan.actions }, null, 2)}\n`);
  else {
    const at = (p: string, l: number | null) => (l === null ? p : `${p}:${l + 1}`);
    for (const a of plan.actions) ctx.out(`${a.kind.padEnd(6)} ${at(a.path, a.line)}: ${a.text}  (from ${at(a.cause.path, a.cause.line)})\n`);
    if (!plan.actions.length) ctx.out('Every inverse and symmetric edge is written on both ends.\n');
    else ctx.out(`\n${changes.length} change${changes.length === 1 ? '' : 's'} in ${plan.edits.size} note${plan.edits.size === 1 ? '' : 's'}${write ? ' written' : '; run with --write to apply'}.${stale ? ` ${stale} edit${stale === 1 ? '' : 's'} skipped because the line changed.` : ''}\n`);
  }
  return write || changes.length === 0 ? EXIT_OK : EXIT_FINDINGS;
}

export const inverses: Command = {
  name: 'inverses',
  summary: 'Write the missing end of inverse and symmetric edges in a vault, and fix ends that disagree (dry run unless --write)',
  usage: USAGE,
  flags: { vault: 'string', 'schema-folder': 'string', write: 'bool', placement: 'string', heading: 'string', winner: 'string', deletions: 'string', 'frontmatter-edges': 'bool' },
  noProject: true,
  run(ctx, args, flags) {
    if (args.length) {
      ctx.err(`usage: tg ${USAGE}\n`);
      return EXIT_ERROR;
    }
    return runInverses(ctx, flags);
  },
};

register(inverses);
