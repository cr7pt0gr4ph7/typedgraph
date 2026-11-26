## Why

Schemas can already be exchanged with RDF tools as SHACL. SHACL says what a valid note looks like, but reasoners, ontology editors (Protégé, WebVOWL) and knowledge-graph tooling expect an OWL ontology that says what the types and relations mean, so they can load it, link it to other vocabularies and draw inferences from it. Today a user has to write that ontology by hand next to the schema notes, and the two drift apart.

## What Changes

- New `exportOwl(set, opts)` in core, a pure, host-free mapping from a schema set to one OWL 2 DL ontology in Turtle plus a loss report. It is a separate entry point (`@obsigraph/core/src/owl.ts`), like SHACL.
- `tg schema export <out.ttl> --format owl [--ontology-iri iri]` in the CLI, printing the loss report (in `--json` as `losses`).
- An "Export schemas as OWL" command in the Obsidian plugin, showing the loss report in a dialog.
- TGS 0.7: a normative OWL mapping section, an OWL exporter conformance level, the annotation term `tgs:edgeType`, and expected `ontology.ttl` files for conformance examples 05 and 09. 0.6 is archived unchanged. 0.7 adds no key and changes no rule.
- The Turtle writer that the SHACL export used internally moves to `packages/core/src/rdf/turtle.ts` so both exporters share it. SHACL output is unchanged except its header now names TGS 0.7.
- Export only: there is no OWL import. Open-world axioms do not map back to validation rules without guessing.

## Capabilities

### New Capabilities

- `owl-export`: exporting schema notes as an OWL 2 ontology, with a loss report.

### Modified Capabilities

- `tgs-spec`: TGS 0.7 publishes the OWL mapping and an OWL exporter conformance level.

## Impact

- Code: `packages/core/src/owl/`, `packages/core/src/owl.ts`, `packages/core/src/rdf/turtle.ts`, `packages/core/src/shacl/export.ts`, `packages/core/src/schema/schema.ts` (`TGS_VERSION`), `packages/cli/src/commands/schema.mts`, `packages/plugin/src/schema-commands.ts`.
- Spec: `spec/tgs/SPEC.md`, `tgs.schema.json`, `namespace.json`, `examples/05-shacl/ontology.ttl`, `examples/09-owl/`, `archive/v0.6/`; `site/build-spec.mjs` publishes 0.7.
- Docs: [[lat.md/shacl#OWL export]] and its decisions, [[lat.md/shacl#Typed Graph Schema]], [[lat.md/shacl#Commands]], [[lat.md/cli]], the test specs [[lat.md/tests/owl-export]] and [[lat.md/tests/tgs-spec]], `packages/cli/README.md`, `site/docs.html`, `CHANGELOG.md`.
- Requirements: adds [[openspec:owl-export#Export schemas as OWL]], [[openspec:owl-export#Class mapping]], [[openspec:owl-export#Property mapping]], [[openspec:owl-export#Edge type mapping]], [[openspec:owl-export#Edges of a type as restrictions]], [[openspec:owl-export#Edge properties as annotation properties]], [[openspec:owl-export#OWL 2 DL output]], [[openspec:owl-export#Loss report]] and [[openspec:tgs-spec#TGS 0.7 published]].
- The VS Code extension has no schema commands and gets none in this change.
