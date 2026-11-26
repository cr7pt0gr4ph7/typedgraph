---
type: Scenario
lat:
  require-code-mention: true
---
# OWL Export Tests

Test specifications for exporting schema notes as an OWL 2 ontology, covering every scenario in the owl-export spec. See [[shacl#OWL export]].

## Export writes an OWL ontology

Export writes one `owl:Ontology` with its label and TGS version that parses as Turtle, gives the same bytes on a second run, honors the ontology IRI option, and gives a header only with no losses for an empty vault.

## Types become classes

Declared types and types named only as targets are `owl:Class`es with label and comment, foreign classes have no `rdfs:isDefinedBy`, and no disjointness is written.

## Properties are global with local restrictions

A property declared on two types is one property with a union domain and no range when its kinds differ, and `required`, single values and `values` are restrictions on the declaring class.

## Edge types become object properties

An edge type is an object property with domain from `from`, a union range from `to`, its comment and its visualization.

## Edges of a type become restrictions

Targets, required edges with and without targets, single edges and the allow-list of a type become the matching restrictions and `tgs:edgesClosed` on its class.

## Edge descriptions annotate their axiom

The description of an edge entry annotates the `rdfs:subClassOf` axiom of its first restriction through `owl:Axiom`, and a description with nothing to annotate is a loss.

## Edge properties become annotation properties

Edge properties are annotation properties with their datatype as range and `tgs:edgeType` naming the edge type.

## Loss report lists what OWL cannot say

Closed edges, defaults, constrained edge properties, foreign terms and conflicting ranges are reported, sorted by code and subject, each with a message.

## A term has one role

A name used as a frontmatter property and as an edge property is declared once, as a datatype property, with a conflict loss, and link values are reported.

## Every term is declared once

For every conformance example, each IRI has one declaration, every predicate outside the reserved vocabularies is a declared annotation property, and restrictions and domains point at declared properties and classes.

## Same IRIs as the SHACL export

For every conformance example, the classes and property paths of the SHACL export are declared in the OWL export.

## Export from the CLI as OWL

`tg schema export --format owl` writes the ontology with the given ontology IRI and the schema folder as label, prints the loss report or returns it as `losses`, and rejects unknown formats and `--ontology-iri` with SHACL.

