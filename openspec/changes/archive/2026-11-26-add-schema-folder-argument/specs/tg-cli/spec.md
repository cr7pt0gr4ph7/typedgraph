## ADDED Requirements

### Requirement: Schema folder
Every `tg` command that reads or writes the project ontology (`ontology`, `ontology check`, `cypher`, `validate`, `schema export`, `schema import`, `migrate`, `init` and `upgrade`) SHALL take `--schema-folder <dir>`. Without the flag it SHALL use `schemaFolder` from the project's `.tg/config.json` (the `--vault` folder for `validate` and `schema`), else `Types/`. The value SHALL name a folder below the project root: an absolute path, a `..` segment or the root itself SHALL be a usage error with exit 2 for the flag, and reported as a config error for the key, which then falls back to `Types/`. A broken `schemaFolder` SHALL NOT discard the config's `notes` globs.

#### Scenario: Flag over config over default
- **WHEN** `.tg/config.json` holds `{"schemaFolder": "./Ontology/"}`
- **THEN** commands read `Ontology/`, `--schema-folder Schemas` makes them read `Schemas/`, and in a project without the key they read `Types/`

#### Scenario: Every reading command
- **WHEN** the schema notes sit in `Ontology/` and the config names it
- **THEN** `tg ontology` lists them, `tg cypher` turns a declared element into a node of its type, `tg validate` and `tg schema export` read them, and `tg migrate` chooses relations from them

#### Scenario: Folder outside the project
- **WHEN** any of these commands gets `--schema-folder ../up`
- **THEN** it prints `--schema-folder must stay inside the project` and exits 2
