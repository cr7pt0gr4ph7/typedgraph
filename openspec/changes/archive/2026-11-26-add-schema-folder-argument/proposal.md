## Why

`tg ontology`, `tg validate` and `tg schema` took `--schema-folder`, but `tg cypher` and `tg migrate` always read `Types/`, and `tg init` and `tg upgrade` always wrote there. A project that keeps its schema notes elsewhere got element nodes, relation choices and ontology files from the wrong folder. Passing the flag to every command is also error-prone, and the Obsidian plugin keeps its own schema folder setting that could drift from the CLI's.

## What Changes

- **`--schema-folder` everywhere.** `tg cypher`, `tg migrate`, `tg init` and `tg upgrade` gain the flag, beside `ontology`, `validate` and `schema`. All of them check the value: it must name a folder below the project root.
- **`schemaFolder` in `.tg/config.json`.** Without the flag, every schema command reads the folder from the committed project config, then falls back to `Types/`. A broken value is reported and does not hide the `notes` globs.
- **Init and upgrade write into the folder.** `code-types.md`, `core-types.md` and `spec-types.md` go into the schema folder. The instructions, skills, Cursor rules, ontology guide and spec ontology name it. A folder given with the flag that differs from the project's is recorded in `.tg/config.json`; the default folder writes no config.
- **Obsidian plugin: "Sync .tg/config.json".** A new setting keeps the plugin's schema folder and the config's `schemaFolder` in step both ways. It is on for a new configuration when the vault has the file. Obsidian sends no events for dot folders, so the file is polled every three seconds while sync is on.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `tg-cli`: the Schema folder requirement (flag, config, default, validation).
- `tg-agent-integration`: the Schema folder choice requirement for init, upgrade and migrate's setup.
- `schema-notes`: the plugin reads its schema folder from the project config.

## Impact

- `packages/core/src/schema/schema.ts`: `configFolder` and `schemaFolderProblem`, shared by the CLI and the plugin.
- `packages/cli/src/config.mts`, `project.mts`, `commands/{graph,ontology,validate,schema,migrate,init,upgrade,mcp-server}.mts`.
- `packages/plugin/src/tg-config.ts` (new), `main.ts`, `settings.ts`.
- Not changed: the VS Code extension's schema folder setting and the sidecar's `OBSIGRAPH_SCHEMA_FOLDER`; the MCP tools inherit the config through the CLI.
