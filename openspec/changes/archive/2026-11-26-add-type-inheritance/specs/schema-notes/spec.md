## ADDED Requirements

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
