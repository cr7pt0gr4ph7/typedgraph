---
tgs: "0.7"
schemas:
  Asset:
    abstract: true
    properties:
      value: number
  Valued:
    abstract: true
    properties:
      value: text
  Vehicle:
    is: [Asset, Valued]
  Building:
    is: Asset
    properties:
      value: date
  Robot:
    is: [Person, Machine]
  Loop:
    abstract: true
    is: Loop2
  Loop2:
    abstract: true
    is: Loop
---
