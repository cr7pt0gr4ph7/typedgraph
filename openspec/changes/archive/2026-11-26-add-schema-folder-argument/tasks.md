## 1. Core and CLI

- [x] 1.1 Add `configFolder` and `schemaFolderProblem` to core
- [x] 1.2 Read `schemaFolder` from `.tg/config.json`; add `resolveSchemaFolder` (flag, then config, then `Types/`)
- [x] 1.3 Make `Project` take the schema folder; use it in `cypher`, `ontology`, `validate`, `schema` and `migrate`
- [x] 1.4 `init` and `upgrade`: write the ontology notes into the folder, rewrite `Types/` in written text, record a new folder in `.tg/config.json`

## 2. Obsidian plugin

- [x] 2.1 Add `TgConfigSync` (pull, push, poll) over the vault adapter
- [x] 2.2 Add the "Sync .tg/config.json" setting to both settings UIs; on for a new configuration when the file exists

## 3. VS Code extension

- [x] 3.1 Add `workspaceSchemaFolder`: a setting the user set, else `.tg/config.json` (re-read each use), else `Types/`
- [x] 3.2 Default `typegraph.schemaFolder` to empty; detect an override with `inspect`

## 4. Tests and docs

- [x] 4.1 CLI tests in `packages/cli/test/schema-folder.test.ts`; plugin tests in `packages/plugin/test/tg-config.test.ts`
- [x] 4.2 Update `lat.md/cli.md`, `lat.md/graph-model.md`, the test specs, the site docs and the changelog
- [x] 4.3 `npm test`, `npm run typecheck`, `tg check` and `tg ontology check` pass
