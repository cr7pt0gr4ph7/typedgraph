---
tgs: "0.7"
schemas:
  CatalogEntry:
    abstract: true
    description: An entry in the catalog. Write a note as a Table, Metric, Dashboard, Term or Runbook; each carries the keys OKF recommends, declared here once.
    properties:
      title: text
      description: {kind: text, required: true}
      resource: link
      tags: list
      stale_after: datetime
  Table:
    is: CatalogEntry
    properties:
      grain: text
    edges:
      owned_by: Person
      derived_from: Table
    visualization: {color: "#0ea5e9", shape: rectangle, icon: table}
  Metric:
    is: CatalogEntry
    properties:
      unit: text
    edges:
      computed_from: Table
      defined_by: Term
      shown_in: Dashboard
      owned_by: Person
    visualization: {color: "#22c55e", shape: ellipse, icon: gauge}
  Dashboard:
    is: CatalogEntry
    edges:
      owned_by: Person
    visualization: {color: "#f59e0b", shape: round-rectangle, icon: layout-dashboard}
  Term:
    is: CatalogEntry
    visualization: {color: "#a855f7", shape: tag, icon: book-open}
  Runbook:
    is: CatalogEntry
    edges:
      covers: [Table, Dashboard, Metric]
      owned_by: Person
    visualization: {color: "#e5484d", shape: hexagon, icon: life-buoy}
  Person:
    properties:
      title: text
      description: {kind: text, required: true}
      role: text
    visualization: {color: "#ec4899", shape: ellipse, icon: user}
edgeTypes:
  owned_by: {from: [Table, Metric, Dashboard, Runbook], to: Person}
  computed_from: {from: Metric, to: Table}
  defined_by: {from: Metric, to: Term}
  shown_in: {from: Metric, to: Dashboard}
  covers: {from: Runbook, to: [Table, Dashboard, Metric]}
---
The OKF ontology: concepts for a data and knowledge catalog (tables, metrics, dashboards, glossary terms, runbooks and the people who own them), shaped so a vault using it exports as a conformant Open Knowledge Format bundle.

Every catalog type is a `CatalogEntry`, an abstract type (TGS 0.7) that declares the keys OKF recommends (`title`, `description`, `resource`, `tags`, `stale_after`) once, and `description` is required here, since the format's consumers rely on it. Provenance keys such as `verified` and `sources` are allowed on any note and are never invented by the export.

`derived_from` is declared once in the shared `core` ontology (with an optional `transform`), so this note only says that a table derives from a table.
