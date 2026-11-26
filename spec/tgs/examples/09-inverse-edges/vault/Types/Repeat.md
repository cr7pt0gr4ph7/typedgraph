---
tgs: "0.7"
edgeTypes:
  hasEmployee:
    from: Company
    to: Person
    inverseEdge: worksAt
    properties:
      role: {values: [engineer, manager]}
---

`hasEmployee` declares `worksAt` again, read from its target, with the same properties. It is reported as `inverse-duplicate` and ignored, and `hasEmployee` stays the inverse name of `worksAt`.
