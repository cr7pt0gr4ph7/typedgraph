## ADDED Requirements

### Requirement: Schema folder required
Every command that builds the graph from the ontology or exports it (`tg cypher`, the MCP tool `tg_cypher`, and `tg schema export`) SHALL stop before any other work when its schema folder (`Types/` of the project root or vault, or `--schema-folder`) gives no schema notes, because it is missing, is not a directory or holds no markdown note directly inside it. It SHALL print the "No ontology declared" message of `tg ontology` (`No ontology declared: Types/ has no schema notes. Run tg init to install the code ontology, or add schema notes to Types/.`) to stderr, write nothing to stdout even with `--json`, and exit 2. A command that takes `--schema-folder` SHALL also take `--ignore missing-ontology` to carry on without schema notes. `tg ontology`, `tg ontology check` and `tg schema import` SHALL be exempt: the first two report an empty ontology themselves, and import creates the folder.

#### Scenario: Missing schema folder
- **WHEN** `tg cypher` or `tg schema export` runs where there is no `Types/` folder
- **THEN** stderr says `No ontology declared: Types/ has no schema notes` and names `tg init`, and the exit code is 2

#### Scenario: Schema folder without schema notes
- **WHEN** `Types/` exists but holds no `*.md` file directly inside it
- **THEN** the same message is printed and the exit code is 2

#### Scenario: Ignore a missing ontology
- **WHEN** `tg schema export shapes.ttl --ignore missing-ontology` runs without schema notes
- **THEN** it writes a document with prefixes only, reports that no types were found, and exits 0
