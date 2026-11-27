## ADDED Requirements

### Requirement: Schema folder from the project config
The Obsidian plugin SHALL offer a "Sync settings with .tg/config.json" setting beside its schema folder. While it is on, the plugin SHALL adopt the folder named by `schemaFolder` in the vault's `.tg/config.json` when settings load and whenever the file changes, and SHALL write its schema folder setting into that file when the setting changes, keeping the file's other keys, creating the file when absent, and leaving a file that is not a JSON object untouched. A new configuration (no saved plugin data) SHALL start with the setting on when the vault has a `.tg/config.json`, and off otherwise; a saved configuration without the setting SHALL keep it off. Turning it on SHALL adopt the file's folder when it names one, and write the setting's otherwise.

#### Scenario: New configuration
- **WHEN** the plugin loads in a vault whose `.tg/config.json` holds `{"schemaFolder": "Ontology"}` and no plugin data is saved
- **THEN** the setting is on and the schema folder is `Ontology/`; in a vault without the file it is off and the folder is `Types/`

#### Scenario: Two-way sync
- **WHEN** sync is on and the schema folder setting becomes `Schemas`, then the file is edited outside Obsidian to name `Ontology`
- **THEN** the file gains `"schemaFolder": "Schemas"` with its `notes` kept, and within a few seconds the setting becomes `Ontology/`; the plugin's own write is not taken for an outside edit
