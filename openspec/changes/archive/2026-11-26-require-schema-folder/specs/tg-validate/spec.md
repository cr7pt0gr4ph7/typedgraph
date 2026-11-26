## ADDED Requirements

### Requirement: Missing schema folder
When the schema folder (`Types/` of the vault, or `--schema-folder`) is missing, is not a directory or holds no markdown note directly inside it, `tg validate` SHALL report one finding with code `missing-schema`, severity error, the folder as its path and no line, whose message says which of the three it is and how to proceed. It SHALL be reported with `--schema-only` too, and `--only` and `--ignore` SHALL select it like any other code, so `--ignore missing-schema` validates a vault without schemas.

#### Scenario: Vault without schemas
- **WHEN** a vault has no `Types/` folder
- **THEN** the first finding is `missing-schema` with path `Types`, only edge syntax and embed findings follow, and the exit code is 1; with `--ignore missing-schema` the exit code is 0

#### Scenario: Schema folder without schema notes
- **WHEN** `Types/` holds no `*.md` note directly inside it, or `--schema-folder` names a folder that does not exist
- **THEN** the `missing-schema` finding names that folder, the text summary counts one error, and `--schema-only` exits 1 as well

## MODIFIED Requirements

### Requirement: Validate a vault
The system SHALL provide `tg validate` that reads every markdown note under a vault (skipping dot folders), builds the typed graph and reports edge syntax errors, schema declaration problems, schema validation findings, style problems and edge embed warnings, and SHALL NOT modify any file.

#### Scenario: Findings reported
- **WHEN** `tg validate --vault v` runs on a vault where a Person note lacks a required `email`
- **THEN** the output lists that note with the finding and the exit code reflects the severity rules below

#### Scenario: Clean vault
- **WHEN** a vault has no findings
- **THEN** the command prints a one-line summary and exits 0

### Requirement: Finding codes and severities
Every finding SHALL carry a stable code, a severity of error or warning, a vault-relative path and a 1-based line when known. Codes SHALL be the TGS diagnostic names for schema findings, `edge-syntax` for malformed edge lines or property blocks, `style` for invalid visualization values, `embed` for edge embed problems and `missing-schema` for a schema folder without schema notes. Declaration problems (`invalid-declaration`, `unsupported-version`, `duplicate-declaration`) and `missing-schema` SHALL be errors and all other findings warnings.

#### Scenario: Code on every finding
- **WHEN** a note has a disallowed edge
- **THEN** the finding has code `edge-not-allowed`, severity warning, the note path and the edge's line

#### Scenario: Declaration error
- **WHEN** a schema note declares `edges: 5`
- **THEN** the finding has code `invalid-declaration` and severity error
