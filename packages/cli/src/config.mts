import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configFolder, DEFAULT_SCHEMA_FOLDER, normalizeFolder, schemaFolderProblem } from '@obsigraph/core';

export { configFolder, schemaFolderProblem };

export interface TgConfig {
  /** Globs, relative to the project root, of `.adoc` files read as notes. */
  notes: string[];
  /** The schema folder, relative to the project root, as written (`Ontology`); absent means `Types/`. */
  schemaFolder?: string;
}

/** Where the committed config lives; the derived caches beside it are ignored. */
export const CONFIG_FILE = '.tg/config.json';

/** Contents of the `.tg/.gitignore` that keeps derived files out of git but `config.json` in. */
export const TG_GITIGNORE = 'vectors.json\nvectors.f32\n';

/**
 * Read `.tg/config.json`: `{ "notes": ["book/**\/*.adoc"], "schemaFolder": "Types" }`. A missing file is the empty
 * config; a broken file or key is reported in `error` and yields the empty value for what is broken, so a typo
 * never hides the rest of the project.
 */
// @tg: implements:: [[openspec:asciidoc-notes#Hosts index AsciiDoc notes]] {confidence: partial}
// @tg: implements:: [[openspec:tg-cli#Schema folder]]
export function readConfig(root: string): { config: TgConfig; error: string | null } {
  let raw: string;
  try {
    raw = readFileSync(join(root, CONFIG_FILE), 'utf8');
  } catch {
    return { config: { notes: [] }, error: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { config: { notes: [] }, error: `${CONFIG_FILE}: ${(e as Error).message.split('\n')[0]}` };
  }
  const obj = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as { notes?: unknown; schemaFolder?: unknown };
  const config: TgConfig = { notes: [] };
  const errors: string[] = [];
  if (obj.notes !== undefined) {
    if (!Array.isArray(obj.notes) || obj.notes.some((n) => typeof n !== 'string')) errors.push(`${CONFIG_FILE}: "notes" must be a list of glob strings`);
    else config.notes = obj.notes as string[];
  }
  if (obj.schemaFolder !== undefined) {
    const problem = schemaFolderProblem(obj.schemaFolder);
    if (problem) errors.push(`${CONFIG_FILE}: "schemaFolder" ${problem}`);
    else config.schemaFolder = obj.schemaFolder as string;
  }
  return { config, error: errors.length ? errors.join('; ') : null };
}

/**
 * The schema folder a command reads, with a trailing slash: `--schema-folder`, else `schemaFolder` in the
 * project's `.tg/config.json`, else `Types/`. An unusable flag value is an error for the caller to report.
 */
// @tg: implements:: [[openspec:tg-cli#Schema folder]]
export function resolveSchemaFolder(root: string, flag: string | true | undefined): { folder: string; error: string | null } {
  if (typeof flag === 'string') {
    const problem = schemaFolderProblem(flag);
    return problem ? { folder: DEFAULT_SCHEMA_FOLDER, error: `--schema-folder ${problem}` } : { folder: normalizeFolder(configFolder(flag)), error: null };
  }
  const { schemaFolder } = readConfig(root).config;
  return { folder: schemaFolder ? normalizeFolder(configFolder(schemaFolder)) : DEFAULT_SCHEMA_FOLDER, error: null };
}

/** The config file with `patch` merged in, keeping every other key and their order; null when `before` is not a JSON object. */
export function withConfig(before: string | null, patch: Record<string, unknown>): string | null {
  let obj: Record<string, unknown> = {};
  if (before !== null) {
    try {
      const v: unknown = JSON.parse(before);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
      obj = v as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return `${JSON.stringify({ ...obj, ...patch }, null, 2)}\n`;
}
