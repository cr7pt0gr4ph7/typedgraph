## Why

Every command that reads the ontology looks for schema notes in `Types/` (or `--schema-folder`), and when the folder is missing or empty it carries on silently: `tg validate` reports no schema findings, `tg ontology` says no ontology is declared and exits 0, `tg ontology check` has nothing to check, `tg schema export` writes a document with prefixes only and `tg cypher` builds a graph without types. A typo in `--schema-folder`, running from the wrong directory or a project that never ran `tg init` all look like a clean result, in CI too.

## What Changes

- **BREAKING** `tg validate` reports a `missing-schema` finding with severity error when the schema folder is missing, is not a directory or holds no schema notes (`*.md` directly inside it), so it exits 1 without `--strict`. `--ignore missing-schema` keeps validating a vault that has no schemas on purpose.
- **BREAKING** `tg ontology`, `tg ontology check`, `tg schema export` and `tg cypher` print an error to stderr in their usual `message` form and exit 2 in the same cases, before doing any other work. `tg schema export` writes no file then.
- One shared check, `missingSchema` in `packages/cli/src/schema-folder.mts`, gives every command the same three messages: folder not found, not a directory, no schema notes.
- `tg schema import` is unchanged: it creates the folder.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tg-cli`: a new requirement that schema-reading commands fail without schema notes; the ontology listing and check no longer report an empty ontology with exit 0.
- `tg-validate`: the `missing-schema` finding and its severity.
- `shacl-interop`: export from an empty schema folder fails instead of writing prefixes only.

## Impact

- `packages/cli`: `schema-folder.mts` (new), `commands/validate.mts`, `commands/ontology.mts`, `commands/schema.mts`, `commands/graph.mts` (`tg cypher`, and the MCP tools `tg_cypher` and `tg_ontology` that wrap them).
- `packages/core`: `severityOf` treats `missing-schema` as an error.
- lat.md: [[cli#Vault validation]], [[cli#Code ontology#Ontology command]], [[cli#Section graph]], [[shacl#Commands]] and their test specs.
- Requirements: adds [[openspec:tg-cli#Schema folder required]] and [[openspec:tg-validate#Missing schema folder]]; modifies [[openspec:tg-cli#Ontology listing]], [[openspec:tg-cli#Ontology check]], [[openspec:tg-validate#Finding codes and severities]], [[openspec:tg-validate#Validate a vault]] and [[openspec:shacl-interop#Export schemas as SHACL]].
