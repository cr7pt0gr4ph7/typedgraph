import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configFolder, DEFAULT_SCHEMA_FOLDER, normalizeFolder, schemaFolderProblem } from '@obsigraph/core';

/** The tg CLI's committed project config, relative to the workspace folder. */
export const TG_CONFIG_PATH = '.tg/config.json';

export interface SchemaFolderChoice {
  /** The folder, relative to the workspace folder, with a trailing slash. */
  folder: string;
  /** Where it came from: the `typegraph.schemaFolder` setting, `.tg/config.json`, or the `Types/` default. */
  source: 'setting' | 'config' | 'default';
  /** Why a value that was not used was refused, for a message; null when nothing was refused. */
  problem: string | null;
}

/** `schemaFolder` from the workspace's `.tg/config.json`: undefined when the file or key is absent. */
function configValue(workspace: string): unknown {
  try {
    const v: unknown = JSON.parse(readFileSync(join(workspace, TG_CONFIG_PATH), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as { schemaFolder?: unknown }).schemaFolder : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The schema folder New Typed Note reads: `override` (a `typegraph.schemaFolder` the user set, blank meaning not
 * set), else `schemaFolder` from `.tg/config.json`, read again on every call so an edit applies at once, else
 * `Types/`. A value outside the workspace is refused and the next source is used.
 */
// @tg: implements:: [[openspec:typed-note-creation#Schema folder in VS Code]]
export function workspaceSchemaFolder(workspace: string, override: string | undefined): SchemaFolderChoice {
  let problem: string | null = null;
  if (override !== undefined && override.trim() !== '') {
    const p = schemaFolderProblem(override);
    if (!p) return { folder: normalizeFolder(configFolder(override)), source: 'setting', problem: null };
    problem = `typegraph.schemaFolder ${p}`;
  }
  const fromConfig = configValue(workspace);
  if (fromConfig !== undefined) {
    const p = schemaFolderProblem(fromConfig);
    if (!p) return { folder: normalizeFolder(configFolder(fromConfig as string)), source: 'config', problem };
    problem ??= `${TG_CONFIG_PATH}: "schemaFolder" ${p}`;
  }
  return { folder: DEFAULT_SCHEMA_FOLDER, source: 'default', problem };
}

/** The value the user set for a setting at the most specific scope, from `WorkspaceConfiguration.inspect`. */
export function overrideOf(inspected: { globalValue?: string; workspaceValue?: string; workspaceFolderValue?: string } | undefined): string | undefined {
  return inspected?.workspaceFolderValue ?? inspected?.workspaceValue ?? inspected?.globalValue;
}
