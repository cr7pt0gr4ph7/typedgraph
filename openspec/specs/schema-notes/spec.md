# schema-notes Specification

## Purpose
Defines optional schema notes that declare a type's properties, defaults, allowed edge types and template, and the command that creates a note from a type, so vault structure can be typed without making the graph depend on it.

## Requirements

### Requirement: Schema notes are discovered by location
The system SHALL treat each markdown note directly in the configured schema folder (default `Types/`) as a schema note, and SHALL work normally when no schema notes exist. A schema note SHALL declare the type named by its title under `schema:`, any number of types under `schemas:` (a mapping from type name to schema), edge types under `edgeTypes:`, or any combination of these, so one note can describe a single type or a whole subgraph.

#### Scenario: Schema found for a type
- **WHEN** the note `Types/Person.md` declares `schema:` and a note has `type: Person`
- **THEN** the schema for `Person` is available for that note

#### Scenario: Several types in one note
- **WHEN** `Types/People and Orgs.md` declares `schemas:` with keys `Person` and `Company`
- **THEN** schemas for both `Person` and `Company` are available and no type named `People and Orgs` exists

#### Scenario: Both forms in one note
- **WHEN** `Types/Person.md` declares `schema:` and also `schemas:` with key `Address`
- **THEN** schemas for both `Person` and `Address` are available

#### Scenario: Notes outside the folder are ignored
- **WHEN** a note in `Types/archive/` or outside `Types/` declares `schemas:`
- **THEN** none of its types are read as schemas

#### Scenario: No schemas present
- **WHEN** the schema folder is missing or empty
- **THEN** the graph builds and queries run exactly as without the feature and no diagnostics are raised

### Requirement: Property declarations
The system SHALL read for each type its properties, each with a name, a kind (text, number, boolean, date, datetime, link or list), an optional default value, a required flag, a `many` flag (default false) marking a list value, an optional `values` list of allowed values, and an optional `uri`. A property MAY be written as a kind shorthand (`born: date`), a mapping, or an entry in a list.

#### Scenario: Declared property with default
- **WHEN** `Types/Person.md` declares property `status` of kind text with default `active`
- **THEN** the schema for `Person` lists `status` with default `active`, required false and many false

#### Scenario: Enum and list attributes read
- **WHEN** a property declares `{kind: text, values: [active, alumni], many: true}`
- **THEN** the schema lists that property with those allowed values and many true

#### Scenario: Unknown kind
- **WHEN** a property declares a kind that is not supported
- **THEN** the property is treated as text and a diagnostic names the schema note and the property

### Requirement: Allowed edge types
The system SHALL read an optional `edges` declaration per type, either as a list of edge type names or as a mapping from edge type name to a target type name or to `{target, many, required}`, and SHALL report an edge whose source node has that type and whose edge type is not declared. Edge entries SHALL default to many true and required false; a list entry or an entry without a target accepts any target.

#### Scenario: Disallowed edge type reported
- **WHEN** `Person` allows only `knows` and `worksAt` and a Person note contains `owns:: [[Car]]`
- **THEN** a diagnostic points at that edge stating `owns` is not allowed for `Person`

#### Scenario: Map form with target
- **WHEN** `Person` declares `edges: {worksAt: Company}`
- **THEN** `worksAt` is allowed for `Person` with target type `Company`

#### Scenario: No list means unrestricted
- **WHEN** a schema declares no `edges`
- **THEN** every edge type is accepted for that type

### Requirement: Required property validation
The system SHALL report a diagnostic for a note whose type declares a property as required and whose frontmatter lacks it, and SHALL NOT exclude the note from the graph.

#### Scenario: Missing required property
- **WHEN** `Person` requires `born` and a Person note has no `born`
- **THEN** a diagnostic names the note and `born`, and the note is still a node in the graph

### Requirement: Create a note from a type
The system SHALL provide a command that asks for a type and a title and creates a note whose frontmatter contains `type` and every declared default, followed by the type's template. The template SHALL be the note named by the type's `template` link when present, otherwise the body of a `schema:` note, otherwise a template generated from the schema.

#### Scenario: Template applied
- **WHEN** the user creates a note titled `Alice` from the type `Person` whose schema defaults `status` to `active` and whose template body has a `## Notes` heading
- **THEN** the new note has `type: Person`, `status: active` and a `## Notes` heading

#### Scenario: Template note used
- **WHEN** `Person` declares `template: "[[Templates/Person]]"` and that note exists
- **THEN** the new note's body is the body of `Templates/Person`

#### Scenario: Template generated from schema
- **WHEN** `Company` is declared under `schemas:` with properties `name` and `founded`, edge `employs: Person`, and no template link
- **THEN** the new note's frontmatter has `type: Company` and keys `name` and `founded` (empty unless defaulted), and its body has one placeholder line for `employs` that does not produce an edge until a target is filled in

#### Scenario: Existing note is never overwritten
- **WHEN** a note with the requested title already exists
- **THEN** the command reports the conflict and leaves the existing note unchanged

### Requirement: Schema changes take effect live
The system SHALL re-read a schema when its note changes, and SHALL update diagnostics for affected notes in the same vault index update that processes the change, without reopening the vault or restarting the plugin.

#### Scenario: Required flag added
- **WHEN** the user marks `born` as required in `Types/Person.md`
- **THEN** after the index processes that change, Person notes without `born` have a diagnostic, with no restart

### Requirement: Duplicate type declarations
The system SHALL report a diagnostic naming both notes when the same type or edge type is declared in more than one place, and SHALL use the declaration from the note whose path sorts first.

#### Scenario: Type declared twice
- **WHEN** `Types/A.md` and `Types/B.md` both declare `Person` under `schemas:`
- **THEN** the schema from `Types/A.md` is used and a diagnostic names both notes

### Requirement: Edge type declarations
The system SHALL read edge types declared under `edgeTypes:` as a mapping from edge type name to `{from, to, properties, uri, visualization}`, where `from` and `to` are a type name or list of type names and `properties` uses the same declaration rules as node properties.

#### Scenario: Edge type with properties
- **WHEN** a schema note declares `edgeTypes: {worksAt: {from: Person, to: Company, properties: {since: date, role: {kind: text, required: true}}}}`
- **THEN** the edge type `worksAt` is available with those endpoints and properties

### Requirement: Edge property validation
The system SHALL report, at the edge's line, a declared required edge property missing from the edge's property block and a property value outside its declared `values`; undeclared edge properties SHALL be accepted.

#### Scenario: Missing required edge property
- **WHEN** `worksAt` requires `role` and a note contains `worksAt:: [[Acme]] {since: 2020}`
- **THEN** a diagnostic at that line names `role` and the edge stays in the graph

#### Scenario: Extra edge property accepted
- **WHEN** a `worksAt` edge carries an undeclared property `note`
- **THEN** no diagnostic is raised for it

### Requirement: Edge endpoint validation
The system SHALL report an edge whose typed target note has none of the target types declared for it (by the source type's `edges` entry, else by the edge type's `to`), and an edge whose source has none of the edge type's `from` types. Stub targets and untyped notes SHALL NOT be reported.

#### Scenario: Wrong target type
- **WHEN** `Person` declares `worksAt: Company` and a Person note has `worksAt:: [[Bob]]` where `Bob` has `type: Person`
- **THEN** a diagnostic at that line states `worksAt` expects `Company`

#### Scenario: Stub target not reported
- **WHEN** the target of a `worksAt` edge does not exist as a note
- **THEN** no endpoint diagnostic is raised

### Requirement: Value and cardinality validation
The system SHALL report a property value outside its declared `values`, a list value for a property that is not `many`, and a node lacking an outgoing edge whose entry is `required`, or having more than one where the entry is not `many`.

#### Scenario: Value outside enum
- **WHEN** `status` allows `active` and `alumni` and a note has `status: retired`
- **THEN** a diagnostic names the note, `status` and the allowed values

#### Scenario: Required edge missing
- **WHEN** `Person` declares `worksAt: {target: Company, required: true}` and a Person note has no `worksAt` edge
- **THEN** a diagnostic names the note and `worksAt`

### Requirement: Identifiers
The system SHALL accept an optional `uri` on types, properties and edge types as a full IRI or a CURIE, SHALL know the prefixes `rdf`, `rdfs`, `xsd`, `sh`, `schema`, `foaf` and `tgs`, SHALL read additional prefixes from a top-level `prefixes:` mapping in any schema note, and SHALL report a CURIE whose prefix is unknown.

#### Scenario: CURIE expanded
- **WHEN** `Company` declares `uri: schema:Organization`
- **THEN** its identifier is `https://schema.org/Organization`

#### Scenario: Unknown prefix
- **WHEN** a type declares `uri: ex:Thing` and no schema note defines prefix `ex`
- **THEN** a diagnostic names the type and the prefix

### Requirement: Multi-label validation
The system SHALL validate a note with several types against the merge of their schemas: the first declaration of a property wins, allowed edge types are the union of all types' edges, the targets of an edge type are the union of its targets, any-target wins over a target list, and `many` and `required` hold when any type sets them.

#### Scenario: Edges from both types allowed
- **WHEN** a note has `type: [Person, Employee]`, `Person` allows only `knows` and `Employee` allows only `works_at`
- **THEN** the note's `knows` and `works_at` edges produce no diagnostic

#### Scenario: Required from one type
- **WHEN** `Employee` requires `employer` and a note typed `[Person, Employee]` lacks it
- **THEN** the note is reported as missing `employer`

### Requirement: Malformed declarations reported
The system SHALL report a malformed declaration (a `schema` that is not a mapping, `edges` that is neither a list nor a mapping, invalid `from` or `to`, a non-string `uri` or `template`, an invalid prefix IRI) as a diagnostic naming the schema note and the key, and SHALL ignore only the malformed part.

#### Scenario: Bad edges value
- **WHEN** `Types/Person.md` declares `edges: 5` and a valid `properties` block
- **THEN** a diagnostic names `Types/Person.md` and `edges`, and the declared properties still validate Person notes

### Requirement: Schema folder from the project config
The Obsidian plugin SHALL offer a "Sync .tg/config.json" setting beside its schema folder. While it is on, the plugin SHALL adopt the folder named by `schemaFolder` in the vault's `.tg/config.json` when settings load and whenever the file changes, and SHALL write its schema folder setting into that file when the setting changes, keeping the file's other keys, creating the file when absent, and leaving a file that is not a JSON object untouched. A new configuration (no saved plugin data) SHALL start with the setting on when the vault has a `.tg/config.json`, and off otherwise; a saved configuration without the setting SHALL keep it off. Turning it on SHALL adopt the file's folder when it names one, and write the setting's otherwise.

#### Scenario: New configuration
- **WHEN** the plugin loads in a vault whose `.tg/config.json` holds `{"schemaFolder": "Ontology"}` and no plugin data is saved
- **THEN** the setting is on and the schema folder is `Ontology/`; in a vault without the file it is off and the folder is `Types/`

#### Scenario: Two-way sync
- **WHEN** sync is on and the schema folder setting becomes `Schemas`, then the file is edited outside Obsidian to name `Ontology`
- **THEN** the file gains `"schemaFolder": "Schemas"` with its `notes` kept, and within a few seconds the setting becomes `Ontology/`; the plugin's own write is not taken for an outside edit

### Requirement: Type inheritance
A type SHALL be able to name the abstract types it is a kind of with `is`, a type name or a list. Its effective declaration SHALL add what it inherits from each direct supertype, in `is` order and with what that supertype inherits:
- properties it does not declare itself;
- edges, elements and sections, merged as for a node with the type and its supertypes as labels;
- visualization, attribute by attribute;
- `template` and `id` when it has none of its own.

`uri` and `description` SHALL NOT be inherited. An inherited template link SHALL resolve from the schema note that declares it, and an inherited template body SHALL be that note's body.

#### Scenario: Inherited property
- **WHEN** `LegalEntity` is abstract with a required `name`, and `Person` declares `is: [LegalEntity]` and `email`
- **THEN** `Person` has the properties `email` and `name`, `name` is required, and `Person`'s supertypes are `[LegalEntity]`

#### Scenario: Own declaration wins
- **WHEN** `Company` inherits `name` and redeclares it as text with a default
- **THEN** `Company`'s `name` is its own declaration, and no diagnostic is reported

#### Scenario: Template and ids inherited
- **WHEN** an abstract type declares a template link and `id: uuid`, and a subtype declares neither
- **THEN** the subtype uses that template, resolved from the supertype's note, and generates a uuid

### Requirement: Inheritance diagnostics
A reader SHALL report these as errors and SHALL ignore the supertype each one names:
- `unknown-base-type`: `is` names a type that is not declared.
- `base-not-abstract`: `is` names a type that is not abstract.
- `inheritance-cycle`: `is` names the type itself, or a type that inherits from it.

A reader SHALL also report `property-conflict` when two supertypes, or a type and a supertype, declare the same property with different kinds. The type's own declaration, or else the first supertype's, SHALL win.

#### Scenario: Conflicting kinds
- **WHEN** `Vehicle` is `[Asset, Valued]`, and `Asset` declares `value: number` while `Valued` declares `value: text`
- **THEN** a `property-conflict` naming both supertypes is reported, and `Vehicle`'s `value` is a number

#### Scenario: Supertype not usable
- **WHEN** a type names an undeclared type, a concrete type, or a type that inherits from it
- **THEN** `unknown-base-type`, `base-not-abstract` or `inheritance-cycle` is reported, and that supertype adds nothing

### Requirement: Base type queries
A node's labels SHALL be its written labels followed by the supertypes of each. A host SHALL apply the hierarchy whenever a schema note changes. Edge type endpoints and edge rule targets that name a supertype SHALL accept nodes of its subtypes.

#### Scenario: Query on a base type
- **WHEN** `Alice` is a `Person`, `Acme` is a `Company`, and both own a patent
- **THEN** `MATCH (a:LegalEntity)-[:owns]->(p:Patent)` returns both

#### Scenario: Edge rules name a base type
- **WHEN** the edge type `owns` declares `from: LegalEntity`, and a `Patent` declares `heldBy: LegalEntity`
- **THEN** `owns` from a `Person` and `heldBy` to a `GeneralLegalEntity` are accepted, and `owns` from a `Patent` is reported as `wrong-source-type`

#### Scenario: Hierarchy follows schema edits
- **WHEN** a schema note drops `is: [LegalEntity]` from `Person`, and the hierarchy is applied again
- **THEN** `Person` notes no longer carry the label `LegalEntity`, and only the nodes whose labels changed are reported as changed

### Requirement: Abstract types
A type declared `abstract: true` SHALL be usable only as a supertype, in queries, edge rules and edge types. A note whose written labels include an abstract type SHALL be reported as an `abstract-type` error that names the type's subtypes. `tg ontology check` SHALL report a doc file typed with an abstract type.

#### Scenario: Note of an abstract type
- **WHEN** a note declares `type: LegalEntity`, and `LegalEntity` is abstract
- **THEN** `abstract-type` is reported for that note, naming `Person`, `Company` and `GeneralLegalEntity`
