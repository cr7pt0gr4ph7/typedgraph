## ADDED Requirements

### Requirement: Export schemas as OWL
The system SHALL export every type and edge type in the schema folder as one OWL 2 ontology in Turtle, from the CLI (`tg schema export <out.ttl> --format owl [--vault dir] [--schema-folder Types] [--base iri] [--ontology-iri iri]`) and from the plugin command "Export schemas as OWL". The ontology SHALL use the same identifiers as the SHACL export, its IRI SHALL default to the base IRI, and output SHALL be deterministic.

#### Scenario: Export from the CLI as OWL
- **WHEN** the user runs `tg schema export ontology.ttl --format owl --ontology-iri https://example.org/people` in a vault with `Person` and `Company` schemas
- **THEN** `ontology.ttl` declares `<https://example.org/people>` as an `owl:Ontology` labelled with the schema folder and `:Person` as an `owl:Class`, and the command exits 0

#### Scenario: Deterministic ontology
- **WHEN** the export runs twice without schema changes
- **THEN** both outputs are byte-identical, and an empty schema set gives an ontology header only with no losses

#### Scenario: Same IRIs as SHACL
- **WHEN** a schema set is exported as SHACL and as OWL
- **THEN** every `sh:targetClass` and `sh:class` of the SHACL export is an `owl:Class`, and every property path is declared in the ontology

### Requirement: Class mapping
The system SHALL export each type, and each type named only as a target or endpoint, as an `owl:Class` with `rdfs:label` and `rdfs:comment` from its description; a class in the base IRI SHALL have `rdfs:isDefinedBy` the ontology. The system SHALL NOT write disjointness axioms.

#### Scenario: Types become classes
- **WHEN** `Person` (described), `Bot` and `Company` (`uri: schema:Organization`) are declared and an edge type targets `Team`
- **THEN** all four are `owl:Class`, `Person` has its label and comment and is defined by the ontology, `schema:Organization` is not, and no `owl:disjointWith` is written

### Requirement: Property mapping
The system SHALL export one property per property IRI: `owl:DatatypeProperty` with the XSD range of its kind, or `owl:ObjectProperty` for kind `link`, with `rdfs:domain` the union of the declaring types. Different datatypes SHALL omit the range. `required`, single values and `values` SHALL become restrictions on the declaring class, not global property axioms.

#### Scenario: Properties are global with local restrictions
- **WHEN** `born` is a date on `Person` and a datetime on `Bot`, and `Person` has a required `email` and `status` with values
- **THEN** `born` is one datatype property with a union domain and no range, `Person` has `owl:minCardinality 1` and `owl:maxCardinality 1` on `email` and an `owl:allValuesFrom` data range on `status`, and no `owl:FunctionalProperty` is written

### Requirement: Edge type mapping
The system SHALL export each edge type as an `owl:ObjectProperty` with `rdfs:domain` from `from` and `rdfs:range` from `to`, each a union for several types, with its label, description, schema note and visualization.

#### Scenario: Edge types become object properties
- **WHEN** `worksAt` is declared `from: Person`, `to: [Company, Team]` with a description and a visualization
- **THEN** `:worksAt` is an object property with domain `:Person`, a union range, its comment and `tgs:visualization`

### Requirement: Edges of a type as restrictions
The system SHALL export each entry of a type's `edges` as restrictions on the type's class: `owl:allValuesFrom` its targets, `owl:someValuesFrom` them when required (`owl:minCardinality 1` for any target), `owl:maxCardinality 1` when not many, and `tgs:edgesClosed true` on a type that declares `edges`. The description of an entry SHALL annotate the axiom of its first restriction.

#### Scenario: Edge entries become restrictions
- **WHEN** `Person` declares `worksAt: Company`, `mentor: {target: Person, many: false}`, `knows: [Person, Bot]`, a required `manager: Person` and a required `likes` with any target
- **THEN** the `Person` class has the matching `allValuesFrom`, `someValuesFrom`, `minCardinality` and `maxCardinality` restrictions and `tgs:edgesClosed true`

#### Scenario: Edge description on the axiom
- **WHEN** an edge entry with a target has a description and one without a target or constraint has a description
- **THEN** an `owl:Axiom` annotates the `rdfs:subClassOf` axiom of the first restriction with the description, and the second description is reported as `owl-edge-description`

### Requirement: Edge properties as annotation properties
The system SHALL export each edge property as an `owl:AnnotationProperty` with `rdfs:range` its XSD datatype and `tgs:edgeType` for each edge type that declares it.

#### Scenario: Edge properties are annotation properties
- **WHEN** `worksAt` declares `since: date` and a required `role` with values
- **THEN** `:since` is an annotation property with range `xsd:date`, and `:role` has `tgs:edgeType :worksAt`

### Requirement: OWL 2 DL output
The system SHALL write an ontology in OWL 2 DL: every IRI declared once, every `tgs:` term used declared `owl:AnnotationProperty`, no reserved vocabulary declared, cardinalities typed `xsd:nonNegativeInteger`. An IRI used in two roles SHALL keep one, in the order class, object property, datatype property, annotation property.

#### Scenario: Declared terms
- **WHEN** each conformance example is exported
- **THEN** every IRI has one declaration, every non-reserved predicate is a declared annotation property, every `owl:onProperty` is an object or datatype property, and every restriction filler and domain is a class

#### Scenario: One role per term
- **WHEN** `since` is both a frontmatter property of `A` and an edge property
- **THEN** `:since` is only a datatype property and `owl-property-conflict` is reported

### Requirement: Loss report
The system SHALL report every construct the ontology does not express, as losses with a code (`owl-closed-edges`, `owl-default`, `owl-edge-description`, `owl-edge-property-constraint`, `owl-foreign-term`, `owl-link-values`, `owl-property-conflict`, `owl-range-conflict`), a subject and a message, sorted by code and subject. The CLI SHALL print the report and include it as `losses` with `--json`; the plugin SHALL show it in a dialog.

#### Scenario: Losses listed
- **WHEN** a schema set has closed edges, a default, a constrained edge property, a foreign class and a property with two kinds
- **THEN** exactly those losses are reported, in order

#### Scenario: Losses in the CLI
- **WHEN** the user exports a vault with closed edges and a default as OWL, with and without `--json`
- **THEN** the text output ends with a loss report naming both, the JSON output has them as `losses`, and an unknown format or `--ontology-iri` with SHACL exits 2
