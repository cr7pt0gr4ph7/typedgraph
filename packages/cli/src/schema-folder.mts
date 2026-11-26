import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Finding code of `tg validate`, and the code `--ignore` takes in `tg schema`, when there is no ontology to read. */
export const MISSING_ONTOLOGY = 'missing-ontology';

/**
 * The "No ontology declared" message of `tg ontology` when `folder` (relative
 * to `root`, with a trailing slash) gives no schema notes, because it is
 * missing, is not a directory or has no markdown note directly inside it;
 * null when it holds at least one.
 */
// @tg: implements:: [[openspec:tg-cli#Schema folder required]]
// @tg: implements:: [[cli#Code ontology#Schema folder required]] {since: "2026-11-26"}
// @lat: [[cli#Code ontology#Schema folder required]]
export function missingOntology(root: string, folder: string): string | null {
  const dir = join(root, folder);
  const hasNotes = folder !== '' && existsSync(dir) && statSync(dir).isDirectory() && readdirSync(dir).some((f) => f.endsWith('.md') && statSync(join(dir, f)).isFile());
  if (hasNotes) return null;
  const name = folder || './';
  return `No ontology declared: ${name} has no schema notes. Run tg init to install the code ontology, or add schema notes to ${name}.`;
}

/** Codes of a comma-separated `--ignore` flag. */
export function ignoredCodes(flag: string | true | undefined): Set<string> {
  return new Set(typeof flag === 'string' ? flag.split(',').map((c) => c.trim()).filter(Boolean) : []);
}
