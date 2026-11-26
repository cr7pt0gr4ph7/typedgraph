import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run, type Io } from '../src/cli.mjs';
import '../src/commands/index.mjs';
import { readConfig, resolveSchemaFolder } from '../src/config.mjs';
import { forSchema } from '../src/commands/init.mjs';

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tg-schema-folder-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

async function tg(cwd: string, args: string[]) {
  let out = '';
  let err = '';
  const io: Io = { cwd, out: (t) => (out += t), err: (t) => (err += t), env: {}, stdin: () => '' };
  const code = await run(args, io);
  return { code, out, err };
}

const read = (dir: string, rel: string) => readFileSync(join(dir, rel), 'utf8');

const SCHEMA = `---
schemas:
  Decision:
    elements:
      term: {type: Concept, description: A term the decision defines.}
  Constraint: {}
  Concept: {}
edgeTypes:
  motivated_by:
    from: Decision
    to: Constraint
---
# Code types

The ontology.
`;
const DOCS = {
  'lat.md/lat.md': '# Project\n\nIndex.\n\n- [[decisions]] — decisions\n- [[constraints]] — constraints\n',
  'lat.md/decisions.md': '---\ntype: Decision\n---\n# Decisions\n\nIndex of decisions.\n\n## Regional storage\n\nWe store data in Frankfurt, motivated by [[constraints#GDPR]].\n\n<term>Region</term> means an EU data centre.\n',
  'lat.md/constraints.md': '---\ntype: Constraint\n---\n# Constraints\n\nIndex of constraints.\n\n## GDPR\n\nPersonal data stays in the EU.\n',
};

describe('schema folder resolution', () => {
  // @tg: verifies:: [[tests/cli-core#Schema folder#Flag over config over default]] {level: unit}
  // @lat: [[tests/cli-core#Schema folder#Flag over config over default]]
  // @tg: verifies:: [[openspec:tg-cli#Schema folder#Flag over config over default]]
  it('takes --schema-folder, else schemaFolder in .tg/config.json, else Types/', () => {
    const plain = project({});
    expect(resolveSchemaFolder(plain, undefined)).toEqual({ folder: 'Types/', error: null });
    const configured = project({ '.tg/config.json': '{"schemaFolder": "./Ontology/"}' });
    expect(resolveSchemaFolder(configured, undefined)).toEqual({ folder: 'Ontology/', error: null });
    expect(resolveSchemaFolder(configured, 'Schemas')).toEqual({ folder: 'Schemas/', error: null });
    expect(resolveSchemaFolder(configured, '../elsewhere').error).toBe('--schema-folder must stay inside the project');
    expect(resolveSchemaFolder(configured, '/abs').error).toBe('--schema-folder must be relative to the project root');
    expect(resolveSchemaFolder(configured, '.').error).toBe('--schema-folder must name a folder below the project root');
  });

  // @tg: verifies:: [[tests/cli-core#Schema folder#Broken config key]] {level: unit}
  // @lat: [[tests/cli-core#Schema folder#Broken config key]]
  it('reports a broken schemaFolder without losing the notes globs', () => {
    const dir = project({ '.tg/config.json': '{"notes": ["book/**/*.adoc"], "schemaFolder": 3}' });
    const { config, error } = readConfig(dir);
    expect(config).toEqual({ notes: ['book/**/*.adoc'] });
    expect(error).toBe('.tg/config.json: "schemaFolder" must be a folder path');
    expect(resolveSchemaFolder(dir, undefined).folder).toBe('Types/');
  });

  // @tg: verifies:: [[tests/cli-core#Schema folder#Schema text follows the folder]] {level: unit}
  // @lat: [[tests/cli-core#Schema folder#Schema text follows the folder]]
  it('rewrites Types/ in template text only where it names the folder', () => {
    expect(forSchema('the schema in `Types/code-types.md`, from Types/', 'Ontology/')).toBe('the schema in `Ontology/code-types.md`, from Ontology/');
    expect(forSchema('MyTypes/ and a/Types/ stay', 'Ontology/')).toBe('MyTypes/ and a/Types/ stay');
    expect(forSchema('Types/', 'Types/')).toBe('Types/');
  });
});

describe('commands that read the schema', () => {
  // @tg: verifies:: [[tests/cli-core#Schema folder#Reading commands]] {level: integration}
  // @lat: [[tests/cli-core#Schema folder#Reading commands]]
  // @tg: verifies:: [[openspec:tg-cli#Schema folder#Every reading command]]
  it('cypher, ontology, validate, schema export and migrate read the configured folder, and the flag overrides it', async () => {
    const dir = project({ ...DOCS, 'Ontology/code-types.md': SCHEMA, '.tg/config.json': '{"schemaFolder": "Ontology"}' });
    const ontology = await tg(dir, ['ontology', '--json']);
    expect(JSON.parse(ontology.out)).toMatchObject({ folder: 'Ontology/' });
    expect(JSON.parse(ontology.out).types.map((t: { type: string }) => t.type)).toEqual(['Decision', 'Constraint', 'Concept']);
    // The schema declares the <term> element as a Concept node, so only the right folder finds it.
    const query = 'MATCH (c:Concept) RETURN count(c) AS n';
    const count = async (...flags: string[]) => JSON.parse((await tg(dir, ['cypher', '--json', ...flags, query])).out).rows;
    expect(await count()).toEqual([[1]]);
    expect(await count('--schema-folder', 'Ontology')).toEqual([[1]]);
    expect(await count('--schema-folder', 'Nothing')).toEqual([[0]]);
    expect((await tg(dir, ['validate', '--json'])).code).toBe(0);
    expect(JSON.parse((await tg(dir, ['validate', '--schema-only', '--json'])).out).notes).toBeGreaterThan(0);
    const exported = await tg(dir, ['schema', 'export', join(dir, 'out.ttl'), '--json']);
    expect(JSON.parse(exported.out)).toMatchObject({ types: 3, edgeTypes: 1 });
    const empty = await tg(dir, ['schema', 'export', join(dir, 'empty.ttl'), '--schema-folder', 'Nothing', '--json']);
    expect(JSON.parse(empty.out)).toMatchObject({ types: 0, edgeTypes: 0 });
    const migrated = await tg(dir, ['migrate', '--dry-run', '--json', '--no-setup', '--no-since', '--force']);
    expect(migrated.code).toBe(0);
    expect(JSON.parse(migrated.out).edges).toEqual([expect.objectContaining({ type: 'motivated_by' })]);
  });

  // @tg: verifies:: [[tests/cli-core#Schema folder#Bad flag value]] {level: integration}
  // @lat: [[tests/cli-core#Schema folder#Bad flag value]]
  // @tg: verifies:: [[openspec:tg-cli#Schema folder#Folder outside the project]]
  it('refuses a schema folder outside the project in every command that takes the flag', async () => {
    const dir = project({ ...DOCS, 'Types/code-types.md': SCHEMA });
    const commands = [['cypher', 'RETURN 1'], ['ontology'], ['ontology', 'check'], ['validate'], ['schema', 'export', 'x.ttl'], ['migrate', '--dry-run'], ['init', '--yes', '--dry-run', '--no-update-check'], ['upgrade', '--dry-run', '--no-update-check']];
    for (const args of commands) {
      const r = await tg(dir, [...args, '--schema-folder', '../up']);
      expect(r.code, args.join(' ')).toBe(2);
      expect(r.err, args.join(' ')).toContain('--schema-folder must stay inside the project');
    }
  });
});

describe('init and upgrade', () => {
  // @tg: verifies:: [[tests/tg-agent#Schema folder choice#Init into another folder]] {level: integration}
  // @lat: [[tests/tg-agent#Schema folder choice#Init into another folder]]
  // @tg: verifies:: [[openspec:tg-agent-integration#Schema folder choice#Init into another folder]]
  it('init --schema-folder writes the ontology there, names it in the instructions and records it in .tg/config.json', async () => {
    const dir = project({});
    const r = await tg(dir, ['init', '--yes', '--agent', 'claude', '--spec', 'adr', '--schema-folder', 'Ontology', '--no-update-check']);
    expect(r.code).toBe(0);
    for (const f of ['code-types.md', 'core-types.md', 'spec-types.md']) expect(existsSync(join(dir, 'Ontology', f)), f).toBe(true);
    expect(existsSync(join(dir, 'Types'))).toBe(false);
    expect(JSON.parse(read(dir, '.tg/config.json'))).toEqual({ schemaFolder: 'Ontology' });
    expect(read(dir, '.tg/.gitignore')).toContain('vectors.json');
    expect(read(dir, 'CLAUDE.md')).toContain('`Ontology/` holds the project');
    expect(read(dir, 'CLAUDE.md')).not.toMatch(/(?<![\w./-])Types\//);
    expect(read(dir, 'lat.md/code-ontology.md')).toContain('`Ontology/code-types.md`');
    expect(read(dir, 'Ontology/spec-types.md')).toContain('`Ontology/code-types.md`');
    expect((await tg(dir, ['check'])).code).toBe(0);
    expect((await tg(dir, ['ontology', 'check'])).code).toBe(0);

    // The recorded folder carries over: a second init and an upgrade change nothing and never create Types/.
    expect((await tg(dir, ['init', '--yes', '--agent', 'claude', '--spec', 'adr', '--no-update-check'])).out).toContain('already set up');
    const up = await tg(dir, ['upgrade', '--yes', '--json', '--no-update-check']);
    expect(JSON.parse(up.out)).toMatchObject({ changes: [], setup: { schemaFolder: 'Ontology/' } });
    expect(existsSync(join(dir, 'Types'))).toBe(false);
  });

  // @tg: verifies:: [[tests/tg-agent#Schema folder choice#Default folder writes no config]] {level: integration}
  // @lat: [[tests/tg-agent#Schema folder choice#Default folder writes no config]]
  // @tg: verifies:: [[openspec:tg-agent-integration#Schema folder choice#Default folder writes no config]]
  it('init without the flag, or with the default folder, writes no .tg/config.json; a new value keeps other keys', async () => {
    const plain = project({});
    await tg(plain, ['init', '--yes', '--agent', 'claude', '--spec', 'none', '--no-update-check']);
    expect(existsSync(join(plain, '.tg'))).toBe(false);
    await tg(plain, ['init', '--yes', '--agent', 'claude', '--spec', 'none', '--schema-folder', 'Types', '--no-update-check']);
    expect(existsSync(join(plain, '.tg'))).toBe(false);

    const kept = project({ '.tg/config.json': '{\n  "notes": ["book/**/*.adoc"],\n  "schemaFolder": "Ontology"\n}\n' });
    await tg(kept, ['init', '--yes', '--agent', 'claude', '--spec', 'none', '--schema-folder', 'Schemas', '--no-update-check']);
    expect(JSON.parse(read(kept, '.tg/config.json'))).toEqual({ notes: ['book/**/*.adoc'], schemaFolder: 'Schemas' });
    expect(existsSync(join(kept, 'Schemas/code-types.md'))).toBe(true);
  });

  // @tg: verifies:: [[tests/tg-upgrade#Schema folder]] {level: integration}
  // @lat: [[tests/tg-upgrade#Schema folder]]
  // @tg: verifies:: [[openspec:tg-agent-integration#Schema folder choice#Upgrade follows the folder]]
  it('upgrade refreshes the ontology in the configured folder and records a folder given with the flag', async () => {
    const dir = project({});
    await tg(dir, ['init', '--yes', '--agent', 'claude', '--spec', 'none', '--schema-folder', 'Ontology', '--no-update-check']);
    // An older core is replaced in the folder it lives in.
    writeFileSync(join(dir, 'Ontology/core-types.md'), '---\nedgeTypes: {}\n---\n# Core\n\nOld.\n');
    const up = await tg(dir, ['upgrade', '--yes', '--json', '--no-update-check']);
    expect(JSON.parse(up.out).changes).toEqual([{ path: 'Ontology/core-types.md', created: false }]);

    const moved = project({});
    await tg(moved, ['init', '--yes', '--agent', 'claude', '--spec', 'none', '--no-update-check']);
    const r = await tg(moved, ['upgrade', '--yes', '--json', '--schema-folder', 'Ontology', '--no-update-check']);
    const paths = JSON.parse(r.out).changes.map((c: { path: string }) => c.path);
    expect(paths).toContain('.tg/config.json');
    expect(paths).toContain('Ontology/core-types.md');
    // The project's own code ontology is never created by an upgrade; it stays where the project keeps it.
    expect(paths).not.toContain('Ontology/code-types.md');
    expect(JSON.parse(read(moved, '.tg/config.json'))).toEqual({ schemaFolder: 'Ontology' });
  });
});
