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

## Missing ends are written

The maintainer adds the missing end of an inverse or symmetric edge to the other note, under a heading, at the end or in frontmatter, limited to given notes, and a second run changes nothing.

## Mismatches are fixed

The losing end's property block is rewritten with the winner's properties, the winner being the declared end or the more recently edited note; this choice is independent of the one for deletions.

## Deleted edges are mirrored on request

With `deletions: mirror` a lone end that the deletion source of truth finds left over (written with the inverse name, or older than its other note) is removed; with `keep` it is completed.

## tg inverses writes on request

`tg inverses` lists missing and differing ends as a dry run (exit 1), writes them with `--write`, and takes placement, heading, both sources of truth and deletions as flags.

## Plugin writes inverse edges on command and on save

The Obsidian plugin syncs with its settings (placement, heading, the two sources of truth, deletions; all off or declared by default), limited to saved notes, once saves pause and never for its own writes.

## Inverse edges survive SHACL

The SHACL export writes `inverseEdge` as `tgs:inverseEdge` on the edge shape, and import and a second export give it back unchanged.

## Backlinks named from the note's side

The VS Code backlinks view groups an incoming edge under the name it has at the open note: an incoming `worksAt` is listed as `hasEmployee`.

## Type details show inverse names

A type's details list an inverse name as an outgoing edge of the declared target type and as an incoming edge of the declared source type.

## TGS 0.7 published with inverse edges

TGS 0.7 documents `inverseEdge`, the JSON Schema and site builder name 0.7, 0.6 stays unchanged in the archive, and every 0.6 example reads the same.
