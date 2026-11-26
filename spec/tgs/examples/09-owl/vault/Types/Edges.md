---
tgs: "0.7"
edgeTypes:
  worksOn:
    description: Time spent on a project.
    from: [Person, Bot]
    to: Project
    properties:
      since: date
      role: {required: true, values: [lead, contributor]}
      hours: {kind: number, default: 0}
  member:
    to: Team
---
