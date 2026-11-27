## Why

`tg ontology`, `tg validate` and `tg schema` took `--schema-folder`, but `tg cypher` and `tg migrate` always read `Types/`, and `tg init` and `tg upgrade` always wrote there. A project that keeps its schema notes elsewhere got element nodes, relation choices and ontology files from the wrong folder. Passing the flag to every command is also error-prone.

## What Changes

- **`--schema-folder` everywhere.** `tg cypher`, `tg migrate`, `tg init` and `tg upgrade` gain the flag, beside `ontology`, `validate` and `schema`. All of them check the value: it must name a folder below the project root.
- **`schemaFolder` in `.tg/config.json`.** Without the flag, every schema command reads the folder from the committed project config, then falls back to `Types/`. A broken value is reported and does not hide the `notes` globs.
- **Init and upgrade write into the folder.** `code-types.md`, `core-types.md` and `spec-types.md` go into the schema folder. The instructions, skills, Cursor rules, ontology guide and spec ontology name it. A folder given with the flag that differs from the project's is recorded in `.tg/config.json`; the default folder writes no config.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `tg-cli`: the Schema folder requirement (flag, config, default, validation).
- `tg-agent-integration`: the Schema folder choice requirement for init, upgrade and migrate's setup.

## Impact

- `packages/core/src/schema/schema.ts`: `configFolder` and `schemaFolderProblem`, shared by every host that reads a schema folder from a flag or a config.
- `packages/cli/src/config.mts`, `project.mts`, `commands/{graph,ontology,validate,schema,migrate,init,upgrade,mcp-server}.mts`.
- Not changed: the VS Code extension's schema folder setting and the sidecar's `OBSIGRAPH_SCHEMA_FOLDER`; the MCP tools inherit the config through the CLI.
