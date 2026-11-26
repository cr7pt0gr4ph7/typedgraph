---
tgs: "0.7"
edgeTypes:
  has_part:
    inverseEdge: part_of
    properties:
      count: number
  part_of:
    properties:
      note: text
  contains:
    inverseEdge: inside
  holds:
    inverseEdge: inside
---

`part_of` is also declared as an edge type, with other properties, so it cannot be the inverse of `has_part` (`inverse-conflict`). `inside` is claimed by both `contains` and `holds` (`inverse-conflict`).
