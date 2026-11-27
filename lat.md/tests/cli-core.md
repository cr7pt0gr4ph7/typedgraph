---
type: Scenario
openspec: ["tg-cli#Schema folder"]
lat:
  require-code-mention: true
---
# CLI Core Tests

Test specifications for the `tg` entry point, root discovery, output contract and packaging described in [[cli#Packaging]].

## Project root discovery

How `tg` decides which directory is the project.

### Run from a subdirectory

Running from `src/auth/` of a project whose root holds `lat.md/` finds that root by walking upward, so hooks work from any directory.

### Explicit directory

`--dir` wins over the working directory, so a command can target another project without changing directory.

### No project found

With no `lat.md/` or `.tg/` above the working directory a command exits 2 and suggests `tg init`.

### tg.md project

A project whose root holds `tg.md/` and no `lat.md/` is found from a subdirectory and checks clean.

### Repository named lat.md

A `lat.md/` folder that is its own git clone does not make its parent a project, so a run beside it finds no project.

## Output and exit codes

The contract hooks and CI rely on.

### Findings

A command that reports findings exits 1, distinct from exit 2 for usage and internal errors.

### JSON output

`--json` makes stdout a single JSON document and nothing else.

### No match

Under `--json`, `section`, `refs`, `locate`, `expand`, `search` and `edges` print exactly one JSON document when nothing matches or a ref fails, and still exit 1.

## Single bundled package

The package ships as one npm package.

### Clean install

`@typedgraph/cli` declares no runtime dependencies and exposes the `tg` binary, so `npx` needs nothing else.

## Docs folder

The project's docs folder is `lat.md/` when it exists, else `tg.md/`.

### tg.md sections

Sections in `tg.md/` get ids starting `tg.md/`, an annotation pointing at one resolves, and the root index `tg.md/tg.md` is checked like `lat.md/lat.md`.

### lat.md wins

With both folders present every command reads `lat.md/`, so a section only in `tg.md/` is not found.

### Hook names the folder

The prompt hook of a `tg.md/` project reminds the agent to keep `tg.md/` in sync and never mentions `lat.md/`.

## Schema folder

How commands find the schema folder, described in [[cli#Code ontology#Schema folder]].

### Flag over config over default

`--schema-folder` wins over `schemaFolder` in `.tg/config.json`, which wins over `Types/`; `./Ontology/` reads as `Ontology/`, and absolute, `..` and root values are refused.

### Broken config key

A `schemaFolder` that is not a folder path is reported as a config error, falls back to `Types/` and keeps the `notes` globs.

### Schema text follows the folder

`Types/` in written text becomes the schema folder only where it names the folder, not inside `MyTypes/` or `a/Types/`.

### Reading commands

With the config naming `Ontology/`, `ontology` lists its types, `cypher` finds the element node its schema declares (and none with `--schema-folder Nothing`), `validate` and `schema export` read it, and `migrate` types a link from it.

### Bad flag value

`--schema-folder ../up` exits 2 with the same message in `cypher`, `ontology`, `ontology check`, `validate`, `schema export`, `migrate`, `init` and `upgrade`.
