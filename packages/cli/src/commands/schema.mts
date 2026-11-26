import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { readSchemaNote, schemaSetFromNotes, splitFrontmatter } from '@obsigraph/core';
import { exportOwl } from '@obsigraph/core/src/owl.js';
import { exportShacl, importShacl, planImport, type ExistingNote } from '@obsigraph/core/src/shacl.js';
import { parse as parseYaml } from 'yaml';
import { EXIT_ERROR, EXIT_FINDINGS, EXIT_OK, register, type Command, type Ctx } from '../cli.mjs';
import { ignoredCodes, MISSING_ONTOLOGY, missingOntology } from '../schema-folder.mjs';
import { resolveSchemaFolder } from '../config.mjs';

const USAGE = [
  'schema export <out.ttl> [--format shacl|owl] [--vault dir] [--schema-folder Types] [--ignore missing-ontology] [--base iri] [--ontology-iri iri]',
  'schema import <file.ttl> [--vault dir] [--schema-folder Types] [--layout auto|per-type|single] [--into name] [--force] [--base iri]',
].join('\n       tg ');

/** Markdown notes directly in the schema folder, with parsed frontmatter. */
export function readSchemaNotes(vault: string, folder: string): ExistingNote[] {
  const dir = join(vault, folder);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => {
      const text = readFileSync(join(dir, f), 'utf8');
      const { yaml } = splitFrontmatter(text);
      let frontmatter: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = yaml === null ? null : parseYaml(yaml);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) frontmatter = parsed as Record<string, unknown>;
      } catch {
        frontmatter = null;
      }
      return { path: `${folder}${f}`, text, frontmatter };
    });
}

const str = (flags: Map<string, string | true>, k: string) => (typeof flags.get(k) === 'string' ? (flags.get(k) as string) : undefined);

// @tg: implements:: [[shacl#Commands]] {since: "2026-10-06"}
// @lat: [[shacl#Commands]]
// @tg: implements:: [[openspec:shacl-interop#Export schemas as SHACL]]
// @tg: implements:: [[openspec:tg-cli#Schema folder required]]
// @tg: implements:: [[openspec:owl-export#Export schemas as OWL]]
// @tg: implements:: [[openspec:owl-export#Loss report]]
function runExport(ctx: Ctx, outArg: string, vault: string, folder: string, flags: Map<string, string | true>): number {
  const format = str(flags, 'format') ?? 'shacl';
  if (format !== 'shacl' && format !== 'owl') {
    ctx.err(`unknown format "${format}"; expected shacl or owl\n`);
    return EXIT_ERROR;
  }
  if (format === 'shacl' && flags.has('ontology-iri')) {
    ctx.err('--ontology-iri applies to --format owl only\n');
    return EXIT_ERROR;
  }
  const noOntology = ignoredCodes(flags.get('ignore')).has(MISSING_ONTOLOGY) ? null : missingOntology(vault, folder);
  if (noOntology) {
    ctx.err(`${noOntology}\n`);
    return EXIT_ERROR;
  }
  const notes = readSchemaNotes(vault, folder);
  const set = schemaSetFromNotes(notes.map((n) => readSchemaNote(n.path, n.frontmatter)));
  const bodies = new Map(notes.map((n) => [n.path, splitFrontmatter(n.text).body]));
  const body = (p: string) => bodies.get(p) ?? null;
  const owl = format === 'owl' ? exportOwl(set, { base: str(flags, 'base'), ontologyIri: str(flags, 'ontology-iri'), label: folder.replace(/\/$/, ''), body }) : null;
  const ttl = owl ? owl.turtle : exportShacl(set, { base: str(flags, 'base'), body });
  const out = resolve(ctx.cwd, outArg);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, ttl);
  const counts = { types: set.schemas.size, edgeTypes: set.edgeTypes.size };
  if (ctx.json) {
    ctx.out(`${JSON.stringify({ out, format, ...counts, diagnostics: set.diagnostics, ...(owl ? { losses: owl.losses } : {}) }, null, 2)}\n`);
    return EXIT_OK;
  }
  const lines =
    counts.types + counts.edgeTypes === 0
      ? [`No types found in ${folder}; wrote prefixes only to ${relative(ctx.cwd, out)}.`]
      : [`Exported ${counts.types} type${counts.types === 1 ? '' : 's'} and ${counts.edgeTypes} edge type${counts.edgeTypes === 1 ? '' : 's'} from ${folder} to ${relative(ctx.cwd, out)} as ${owl ? 'OWL' : 'SHACL'}.`];
  if (set.diagnostics.length) {
    lines.push('', `${set.diagnostics.length} schema diagnostic${set.diagnostics.length === 1 ? '' : 's'}:`);
    for (const d of set.diagnostics) lines.push(`  ${d.path}: ${d.message}`);
  }
  if (owl) {
    lines.push('', owl.losses.length ? `Loss report (${owl.losses.length} thing${owl.losses.length === 1 ? '' : 's'} OWL does not express):` : 'Loss report: everything was expressed in OWL.');
    for (const l of owl.losses) lines.push(`  ${l.code} ${l.subject}: ${l.message}`);
  }
  ctx.out(`${lines.join('\n')}\n`);
  return EXIT_OK;
}

// @tg: implements:: [[shacl#Commands]] {since: "2026-10-06"}
// @lat: [[shacl#Commands]]
// @tg: implements:: [[openspec:shacl-interop#Drop report]]
function runImport(ctx: Ctx, fileArg: string, vault: string, folder: string, flags: Map<string, string | true>): number {
  const file = resolve(ctx.cwd, fileArg);
  if (!existsSync(file)) {
    ctx.err(`${file} does not exist\n`);
    return EXIT_ERROR;
  }
  const layout = str(flags, 'layout') ?? 'auto';
  if (layout !== 'auto' && layout !== 'per-type' && layout !== 'single') {
    ctx.err(`unknown layout "${layout}"; expected auto, per-type or single\n`);
    return EXIT_ERROR;
  }
  let imp;
  try {
    imp = importShacl(readFileSync(file, 'utf8'), { base: str(flags, 'base') });
  } catch (e) {
    ctx.err(`cannot read ${relative(ctx.cwd, file)} as Turtle: ${(e as Error).message}\n`);
    return EXIT_ERROR;
  }
  const plan = planImport(imp, readSchemaNotes(vault, folder), { folder, layout, into: str(flags, 'into'), force: flags.has('force') });
  for (const w of plan.writes) {
    const full = join(vault, w.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, w.text);
  }
  const code = plan.conflicts.length ? EXIT_FINDINGS : EXIT_OK;
  if (ctx.json) {
    ctx.out(`${JSON.stringify({ file, types: imp.types.length, edgeTypes: imp.edgeTypes.length, writes: plan.writes.map(({ text: _t, ...w }) => w), unchanged: plan.unchanged, conflicts: plan.conflicts, warnings: plan.warnings, dropped: imp.dropped }, null, 2)}\n`);
    return code;
  }
  const lines = [`Imported ${imp.types.length} type${imp.types.length === 1 ? '' : 's'} and ${imp.edgeTypes.length} edge type${imp.edgeTypes.length === 1 ? '' : 's'} from ${relative(ctx.cwd, file)}.`];
  for (const w of plan.writes) lines.push(`  ${w.created ? 'created' : 'updated'} ${w.path} (${[...w.types, ...w.edgeTypes].join(', ')})`);
  for (const p of plan.unchanged) lines.push(`  unchanged ${p}`);
  if (plan.conflicts.length) {
    lines.push('', 'Not changed:');
    for (const c of plan.conflicts) lines.push(`  ${c.message}`);
  }
  if (plan.warnings.length) {
    lines.push('', 'Not kept by this layout:');
    for (const w of plan.warnings) lines.push(`  ${w}`);
  }
  lines.push('', imp.dropped.length ? `Drop report (${imp.dropped.length} construct${imp.dropped.length === 1 ? '' : 's'} outside the TGS subset):` : 'Drop report: everything was imported.');
  for (const d of imp.dropped) lines.push(`  ${d.shape}: ${d.construct}`);
  ctx.out(`${lines.join('\n')}\n`);
  return code;
}

export const schema: Command = {
  name: 'schema',
  summary: 'Export schema notes as SHACL or OWL, or import SHACL shapes into schema notes',
  usage: USAGE,
  flags: { vault: 'string', 'schema-folder': 'string', ignore: 'string', format: 'string', base: 'string', 'ontology-iri': 'string', layout: 'string', into: 'string', force: 'bool' },
  noProject: true,
  run(ctx, args, flags) {
    const [sub, target] = args;
    if ((sub !== 'export' && sub !== 'import') || !target) {
      ctx.err(`usage: tg ${USAGE}\n`);
      return EXIT_ERROR;
    }
    const vault = resolve(ctx.cwd, str(flags, 'vault') ?? '.');
    if (!existsSync(vault) || !statSync(vault).isDirectory()) {
      ctx.err(`${vault} is not a directory\n`);
      return EXIT_ERROR;
    }
    const schema = resolveSchemaFolder(vault, flags.get('schema-folder'));
    if (schema.error) {
      ctx.err(`${schema.error}\n`);
      return EXIT_ERROR;
    }
    const folder = schema.folder;
    return sub === 'export' ? runExport(ctx, target, vault, folder, flags) : runImport(ctx, target, vault, folder, flags);
  },
};

register(schema);
