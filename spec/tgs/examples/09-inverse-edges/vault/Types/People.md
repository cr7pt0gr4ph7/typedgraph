---
tgs: "0.7"
schemas:
  Person:
    edges:
      worksAt: {target: Company, many: false}
      friendsWith: Person
  Company:
    edges:
      hasEmployee: Person
edgeTypes:
  worksAt:
    from: Person
    to: Company
    inverseEdge: hasEmployee
    properties:
      role: {values: [engineer, manager]}
  friendsWith:
    from: Person
    to: Person
    inverseEdge: friendsWith
---

People, the companies they work at, and friendships. Each note writes the relation from its own side.
