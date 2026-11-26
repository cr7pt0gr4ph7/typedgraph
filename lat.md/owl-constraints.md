---
type: Constraint
source: "W3C OWL 2 Web Ontology Language: Structural Specification, Mapping to RDF Graphs and Direct Semantics"
openspec: [owl-export]
---
# OWL Constraints

Rules of the W3C OWL 2 standard that the OWL export must respect. Nobody here chose them, and they decide what a schema may become in OWL. See [[shacl#OWL export]].

## OWL 2 DL

An ontology in OWL 2 DL declares every IRI exactly once, as a class or one kind of property. It declares its annotation properties and does not pun reserved `rdf:`, `rdfs:` or `owl:` terms.

Reasoners and editors such as Protégé reject or downgrade an ontology outside DL, so the export stays inside it even where that costs expressiveness.

- constrains:: [[shacl#OWL export#Edge properties as annotation properties]] {strength: must}
- constrains:: [[shacl#OWL export#One role per term]] {strength: must}

## Open-world semantics

OWL axioms license inferences and never report what is missing. A cardinality, domain or range that SHACL checks is something OWL concludes from.

An axiom that a single stray edge or a mixed-type note could contradict makes the whole ontology inconsistent, so only axioms that every valid vault satisfies are exported.

- constrains:: [[shacl#OWL export#Restrictions, not global axioms]] {strength: must}
- constrains:: [[shacl#OWL export#Allow-list as an annotation]] {strength: must}
- constrains:: [[shacl#OWL export#No disjointness]] {strength: must}
