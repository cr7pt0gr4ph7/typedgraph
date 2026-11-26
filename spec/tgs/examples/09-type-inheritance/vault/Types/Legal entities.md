---
tgs: "0.7"
schemas:
  LegalEntity:
    abstract: true
    description: Anyone who can own things and sign contracts.
    properties:
      name: {kind: text, required: true}
    visualization: {color: "#3b82f6"}
  Person:
    is: [LegalEntity]
    properties:
      email: {kind: text, required: true}
    edges: {worksAt: Company, knows: Person, owns: Patent}
    visualization: {shape: ellipse}
  Company:
    is: LegalEntity
    uri: schema:Organization
    properties:
      founded: date
  GeneralLegalEntity:
    is: LegalEntity
  Patent:
    properties:
      id: text
    edges:
      cites: Patent
      heldBy: LegalEntity
edgeTypes:
  owns:
    from: LegalEntity
    to: Patent
    properties:
      since: date
---
