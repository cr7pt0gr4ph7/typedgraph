## Purpose

Lets anyone validate a markdown vault against its schema notes from the command line, in CI or from an agent, with the same findings the Obsidian plugin shows, stable finding codes and machine-readable output.

## ADDED Requirements

### Requirement: Validate a vault
The system SHALL provide `tg validate` that reads every markdown note under a vault (skipping dot folders), builds the typed graph and reports edge syntax errors, schema declaration problems, schema validation findings, style problems and edge embed warnings, and SHALL NOT modify any file.

#### Scenario: Findings reported
- **WHEN** `tg validate --vault v` runs on a vault where a Person note lacks a required `email`
- **THEN** the output lists that note with the finding and the exit code reflects the severity rules below

#### Scenario: Clean vault
- **WHEN** a vault has no findings
- **THEN** the command prints a one-line summary and exits 0

### Requirement: Same findings as the plugin
The system SHALL produce the findings the plugin's diagnostics list shows for the same vault, using one shared implementation.

#### Scenario: Plugin and command agree
- **WHEN** the example vault is validated by the command and by the plugin's diagnostics
- **THEN** both report the same set of findings, apart from lat.md link findings that only the plugin lists

### Requirement: Finding codes and severities
Every finding SHALL carry a stable code, a severity of error or warning, a vault-relative path and a 1-based line when known. Codes SHALL be the TGS diagnostic names for schema findings, `edge-syntax` for malformed edge lines or property blocks, `style` for invalid visualization values, `embed` for edge embed problems and `missing-ontology` for a schema folder without schema notes. Declaration problems (`invalid-declaration`, `unsupported-version`, `duplicate-declaration`) and `missing-ontology` SHALL be errors and all other findings warnings.

#### Scenario: Code on every finding
- **WHEN** a note has a disallowed edge
- **THEN** the finding has code `edge-not-allowed`, severity warning, the note path and the edge's line

#### Scenario: Declaration error
- **WHEN** a schema note declares `edges: 5`
- **THEN** the finding has code `invalid-declaration` and severity error

### Requirement: Exit codes and strictness
The command SHALL exit 0 when there are no errors, 1 when there is at least one error, 2 for unusable input such as a missing vault, and with `--strict` SHALL treat warnings as errors.

#### Scenario: Warnings pass by default
- **WHEN** a vault has only warnings
- **THEN** the exit code is 0 and the warnings are still printed

#### Scenario: Strict fails on warnings
- **WHEN** the same vault is validated with `--strict`
- **THEN** the exit code is 1

#### Scenario: Missing vault
- **WHEN** `--vault` names a path that is not a directory
- **THEN** the command prints an error and exits 2

### Requirement: Selecting findings
The command SHALL accept `--only` and `--ignore` with a comma-separated list of finding codes, and `--schema-only` to check just the schema notes' declarations.

#### Scenario: Ignore a code
- **WHEN** `--ignore wrong-target-type` is given
- **THEN** no finding with that code is reported or counted

#### Scenario: Schema-only
- **WHEN** `--schema-only` is given on a vault with a bad edge line in a data note and a duplicate type in two schema notes
- **THEN** only the duplicate is reported

### Requirement: Output formats
The command SHALL print findings as text by default, as a single JSON document with `--json`, and as SARIF 2.1.0 with `--format sarif`, each result carrying the finding code as its rule id.

#### Scenario: JSON output
- **WHEN** `--json` is given
- **THEN** stdout is one JSON document with `ok`, counts by severity and the list of findings, and nothing else

#### Scenario: SARIF output
- **WHEN** `--format sarif` is given
- **THEN** stdout is a SARIF 2.1.0 log whose results have `ruleId`, a level of `error` or `warning` and a physical location with the note path and line

### Requirement: Missing ontology
With no schema notes, because the schema folder (`Types/` of the vault, or `--schema-folder`) is missing, is not a directory or holds no markdown note directly inside it, `tg validate` SHALL report one finding with code `missing-ontology`, severity error, the folder as its path and no line, and the "No ontology declared" message of `tg ontology` (`No ontology declared: Types/ has no schema notes. Run tg init to install the code ontology, or add schema notes to Types/.`). It SHALL be reported with `--schema-only` too, and `--only` and `--ignore` SHALL select it like any other code, so `--ignore missing-ontology` validates a vault without schemas.

#### Scenario: Vault without schemas
- **WHEN** a vault has no schema notes
- **THEN** the first finding is `missing-ontology` with path `Types`, only edge syntax and embed findings follow, and the exit code is 1; with `--ignore missing-ontology` the exit code is 0

#### Scenario: Schema folder without schema notes
- **WHEN** `Types/` holds no `*.md` note directly inside it, or `--schema-folder` names a folder that does not exist
- **THEN** the `missing-ontology` finding names that folder, the text summary counts one error, and `--schema-only` exits 1 as well
