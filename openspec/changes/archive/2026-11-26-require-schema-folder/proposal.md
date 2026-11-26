## Why

Commands that read the ontology look for schema notes in `Types/` (or `--schema-folder`). When there are none they carry on silently: `tg validate` reports no schema findings, `tg schema export` writes a document with prefixes only and `tg cypher` builds a graph without types. A typo in `--schema-folder`, running from the wrong directory or a project that never ran `tg init` all look like a clean result, in CI too.

## What Changes

- **BREAKING** `tg validate` reports a `missing-ontology` finding with severity error when there are no schema notes (the schema folder is missing, is not a directory or holds no `*.md` note directly inside it), so it exits 1 without `--strict`. `--ignore missing-ontology` keeps validating a vault that has no schemas on purpose.
- **BREAKING** `tg schema export` and `tg cypher` print an error to stderr and exit 2 in the same cases, before doing any other work. `tg schema export` writes no file then, and takes `--ignore missing-ontology` to export prefixes only as before.
- Every one of them uses the "No ontology declared" message `tg ontology` already prints, produced by one shared check, `missingOntology` in `packages/cli/src/schema-folder.mts`.
- `tg ontology` and `tg ontology check` are unchanged: they already report an empty ontology. `tg schema import` is unchanged: it creates the folder.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tg-cli`: a new requirement that `tg cypher` and `tg schema export` fail without schema notes.
- `tg-validate`: the `missing-ontology` finding and its severity.
- `shacl-interop`: export without schema notes fails instead of writing prefixes only, unless `--ignore missing-ontology` is given.

## Impact

- `packages/cli`: `schema-folder.mts` (new), `commands/validate.mts`, `commands/schema.mts`, `commands/graph.mts` (`tg cypher`, and the MCP tool `tg_cypher` that wraps it).
- `packages/core`: `severityOf` treats `missing-ontology` as an error.
- lat.md: [[cli#Vault validation]], [[cli#Section graph]], [[shacl#Commands]] and their test specs.
- Requirements: adds [[openspec:tg-cli#Schema folder required]] and [[openspec:tg-validate#Missing ontology]]; modifies [[openspec:tg-validate#Finding codes and severities]], [[openspec:tg-validate#Validate a vault]] and [[openspec:shacl-interop#Export schemas as SHACL]].
