---
type: Scenario
lat:
  require-code-mention: true
---
# Inverse Edges Tests

Test specifications for inverse and symmetric edge types (TGS 0.7), described in [[graph-model#Inverse edges]].

## Inverse name read

`inverseEdge` is read on an edge type, a symmetric edge type names itself, and a value that is not a name is reported.

## Conflicting inverse names

An inverse name declared as an edge type, or claimed by two edge types, is an `inverse-conflict` and is ignored.

## Inverse name is the same edge

In the canonical view, an edge written with the inverse name is the declared edge turned around, while the graph keeps it as written.

## Both ends merge into one edge

The two written ends of one edge merge into one; differing properties, and an end that denies what the other asserts, are `inverse-mismatch`.

## Symmetric edges hold both ways

A symmetric edge written from both ends is one edge, and each end reads it under the same name.

## Edges read from either end

An edge is named by its type at its declared source and by its inverse name at its declared target.

## Validation reads the declared direction

Endpoints, edge properties and counts are checked on the declared direction, and an edge written from the other end satisfies a required edge.

## Ontology check knows inverse names

`tg ontology check` accepts an inverse name, checks its ends swapped and reports ends that disagree; `tg ontology` lists inverses.

## Queries match either name

With the ontology, a Cypher pattern with the declared name or the inverse name matches the edge whichever end wrote it, and a symmetric edge matches both ways.

## Directed symmetric patterns noticed

A directed Cypher pattern on a symmetric edge type gets one notice per type, naming the undirected form; undirected patterns get none.

## Inverse edges survive SHACL

The SHACL export writes `inverseEdge` as `tgs:inverseEdge` on the edge shape, and import and a second export give it back unchanged.

## Backlinks named from the note's side

The VS Code backlinks view groups an incoming edge under the name it has at the open note: an incoming `worksAt` is listed as `hasEmployee`.

## Type details show inverse names

A type's details list an inverse name as an outgoing edge of the declared target type and as an incoming edge of the declared source type.

## TGS 0.7 published with inverse edges

TGS 0.7 documents `inverseEdge`, the JSON Schema and site builder name 0.7, 0.6 stays unchanged in the archive, and every 0.6 example reads the same.
