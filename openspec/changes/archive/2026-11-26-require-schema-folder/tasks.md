## 1. Shared check

- [x] 1.1 `missingSchema(root, folder, hint)` in `packages/cli/src/schema-folder.mts`, annotated `@tg: implements:: [[openspec:tg-cli#Schema folder required]]`
- [x] 1.2 `severityOf('missing-schema')` is `error` in `packages/core/src/validate/validate.ts`

## 2. Commands

- [x] 2.1 `tg validate` adds the `missing-schema` finding before filtering, so `--only` and `--ignore` apply; SARIF rule text (`@tg: implements:: [[openspec:tg-validate#Missing schema folder]]`)
- [x] 2.2 `tg ontology` and `tg ontology check` exit 2 with the message on stderr
- [x] 2.3 `tg schema export` exits 2 before writing; `tg schema import` unchanged
- [x] 2.4 `tg cypher` exits 2 when `Types/` gives no schema notes

## 3. Tests

- [x] 3.1 `@tg: verifies::` for every scenario of the new and modified requirements
- [x] 3.2 Fixtures that run graph commands get a `Types/` note

## 4. Docs

- [x] 4.1 lat.md sections [[cli#Vault validation]], [[cli#Code ontology#Ontology command]], [[cli#Section graph]], [[shacl#Commands]] and their test specs, with a typed `Decision` section for failing on a missing schema folder
- [x] 4.2 CHANGELOG entry
- [x] 4.3 `tg check`, `tg ontology check` and `tg trace tg-cli --gaps` pass
