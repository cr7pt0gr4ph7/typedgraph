## ADDED Requirements

### Requirement: Schema folder choice
`tg init`, `tg upgrade` and the setup step of `tg migrate` SHALL write the ontology notes (`code-types.md`, `core-types.md`, `spec-types.md`) into the schema folder of the `tg-cli` Schema folder requirement instead of `Types/`, and the instruction block, Cursor rules, skills, ontology guide and spec ontology they write SHALL name that folder. A folder given with `--schema-folder` that differs from the one the project uses SHALL be recorded as `schemaFolder` in `.tg/config.json`, keeping the file's other keys, with the `.tg/.gitignore` beside it; the default folder in a project without the key SHALL write no config. `tg upgrade` SHALL refresh the ontology in the project's schema folder and SHALL never create the project's own `code-types.md`.

#### Scenario: Init into another folder
- **WHEN** `tg init --yes --schema-folder Ontology --spec adr` runs in an empty project
- **THEN** `Ontology/` holds the three ontology notes, no `Types/` exists, `.tg/config.json` is `{"schemaFolder": "Ontology"}`, `CLAUDE.md` names `Ontology/`, and a later `tg init` or `tg upgrade` without the flag changes nothing

#### Scenario: Default folder writes no config
- **WHEN** `tg init` runs without `--schema-folder`, or with `--schema-folder Types`, in a project without `.tg/config.json`
- **THEN** no `.tg/` folder is created; and with a config holding `notes` and `schemaFolder: Ontology`, `--schema-folder Schemas` changes only `schemaFolder`

#### Scenario: Upgrade follows the folder
- **WHEN** the config names `Ontology` and `Ontology/core-types.md` is outdated, or a `Types/` project runs `tg upgrade --schema-folder Ontology`
- **THEN** the first upgrade replaces `Ontology/core-types.md`; the second records the folder in `.tg/config.json` and writes the shared core there, but not `Ontology/code-types.md`
