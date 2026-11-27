---
type: Scenario
openspec: [graph-model]
lat:
  require-code-mention: true
---
# Edge Settings Tests

Test specifications for the plugin settings that switch on [[graph-model#Plain link edges]] and [[edge-syntax#Frontmatter edges]], and for the two settings tabs offering the same settings.

## Both off by default

With neither setting on, plain prose links and frontmatter links produce no edges, so existing vaults read as before.

## Each setting adds its own edges

`linkEdges` adds untyped `links_to` edges for prose links and `frontmatterEdges` adds edges typed by the property name; the two work independently and together.

## Changes apply on re-index

The options are read when a note is indexed, so a changed setting takes effect for notes indexed afterwards and the settings tab re-indexes the vault.

## Toggles in the settings tab

Both options appear as toggles, off by default, in the declarative settings that Obsidian 1.13+ renders; the legacy `display()` tab lists them too, as [[tests/edge-settings#Legacy tab matches the declarative settings]] checks.

## Changing a toggle re-indexes

Changing either edge option, or the AsciiDoc option, re-indexes the vault so existing notes pick it up; changing any other setting does not.

## Declarative settings match the legacy tab

Every setting the legacy tab offers, including the code layer, the schema base IRI and the AsciiDoc toggle, is also in the declarative settings and keeps its side effects: the code layer refreshes, empty values fall back to defaults.

## Legacy tab matches the declarative settings

Rendering the legacy `display()` tab against a recording `Setting` gives the declarative groups' headings, names, descriptions, order and control types; a custom-rendered setting is compared by the controls its `render` adds.

It verifies the graph-model requirement "Legacy settings match the declarative settings".
