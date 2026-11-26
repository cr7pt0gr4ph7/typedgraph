import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Finding code of `tg validate`, and the subject of the error other commands print, when there is no ontology to read. */
export const MISSING_SCHEMA = 'missing-schema';

/**
 * Why `folder` (relative to `root`, with a trailing slash) gives no schema
 * notes, or null when it holds at least one: it is missing, is not a
 * directory, or has no markdown note directly inside it. `hint` ends the
 * message with what to do about it.
 */
// @tg: implements:: [[openspec:tg-cli#Schema folder required]]
// @tg: implements:: [[cli#Code ontology#Schema folder required]] {since: "2026-11-26"}
// @lat: [[cli#Code ontology#Schema folder required]]
export function missingSchema(root: string, folder: string, hint = 'run tg init to install the code ontology, or pass --schema-folder'): string | null {
  if (folder === '') return `no schema folder given; ${hint}`;
  const dir = join(root, folder);
  if (!existsSync(dir)) return `schema folder ${folder} not found; ${hint}`;
  if (!statSync(dir).isDirectory()) return `schema folder ${folder} is not a directory; ${hint}`;
  const notes = readdirSync(dir).filter((f) => f.endsWith('.md') && statSync(join(dir, f)).isFile());
  return notes.length ? null : `schema folder ${folder} has no schema notes (*.md); ${hint}`;
}
