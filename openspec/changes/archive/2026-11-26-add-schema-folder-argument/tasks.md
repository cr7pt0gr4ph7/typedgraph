## 1. Core and CLI

- [x] 1.1 Add `configFolder` and `schemaFolderProblem` to core
- [x] 1.2 Read `schemaFolder` from `.tg/config.json`; add `resolveSchemaFolder` (flag, then config, then `Types/`)
- [x] 1.3 Make `Project` take the schema folder; use it in `cypher`, `ontology`, `validate`, `schema` and `migrate`
- [x] 1.4 `init` and `upgrade`: write the ontology notes into the folder, rewrite `Types/` in written text, record a new folder in `.tg/config.json`

## 2. Tests and docs

- [x] 2.1 CLI tests in `packages/cli/test/schema-folder.test.ts`
- [x] 2.2 Update `lat.md/cli.md`, the test specs, the site docs and the changelog
- [x] 2.3 `npm test`, `npm run typecheck`, `tg check` and `tg ontology check` pass
