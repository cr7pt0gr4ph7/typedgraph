---
type: Scenario
openspec: [schema-notes, typed-note-creation, shacl-interop]
lat:
  require-code-mention: true
---
# Type Inheritance Tests

Test specifications for `is` and `abstract` (TGS 0.7), described in [[graph-model#Type inheritance]]. They are in `packages/core/test/type-inheritance.test.ts`.

## Inherited declarations

A subtype has its own properties first and then those of its supertype. It inherits edges and merged visualization, and does not inherit `uri`. A redeclared property of the same kind is the subtype's own.

## Supertypes through several levels

An abstract type may declare `is` itself. A type's supertypes are listed nearest first, in `is` order, without duplicates, and a diamond adds no conflict.

## Templates and ids inherited

A subtype without a template or ids takes those of its first supertype that has them. An inherited `schema:` note body becomes the new note's template, read from the supertype's note.

## Inheritance diagnostics

The schema check reports:
- conflicting kinds, from two supertypes or from a redeclaration;
- an unknown supertype;
- a concrete supertype;
- a cycle, including a type naming itself.

The first declaration wins, and the bad supertype is ignored.

## Base type matches subtypes

With the hierarchy set, a `Person` node has the labels `Person, LegalEntity`, and `MATCH (a:LegalEntity)-[:owns]->(p)` finds both people and companies.

## Hierarchy follows schema edits

Setting a new hierarchy relabels only the nodes whose labels change, and reports just those to change listeners. Notes added later get their supertypes at once.

## Edges accept subtypes

`owns` with `from: LegalEntity` accepts sources of every subtype, and an edge rule `heldBy: LegalEntity` accepts targets of every subtype.

Validation finds this even on a graph without the hierarchy, and reports sources and targets outside the family.

## Inherited properties validated

A note of a subtype is checked against the required properties and the allowed edges it inherits.

## Abstract type not written

A note whose written type is abstract gets an `abstract-type` error that lists the type's subtypes.

## Abstract types not offered

The types a note can be created as, and the Luhmann types, leave out abstract types.

## SHACL keeps supertypes

The export writes `rdfs:subClassOf` for each supertype, `tgs:abstract true` for an abstract type, and only a type's own property shapes. Importing it and writing notes gives the same supertypes and the same Turtle.

## Docs graph uses the hierarchy

`buildLatGraph`, given the ontology, adds supertypes to the labels of sections in a typed file.
