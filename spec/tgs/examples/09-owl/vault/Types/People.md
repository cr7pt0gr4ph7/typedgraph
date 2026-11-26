---
tgs: "0.7"
schemas:
  Person:
    description: A human being.
    properties:
      name: {required: true, description: What the thing is called.}
      email: {kind: link, values: ["mailto:a@example.org"]}
      status: {values: [active, retired]}
      since: date
      nicknames: list
    edges:
      worksOn: {target: Project, required: true, description: The projects a person spends time on.}
      mentor: {target: Person, many: false}
      knows: [Person, Bot]
      likes: {description: Anything a person likes.}
      member: {required: true}
    sections:
      Background: {description: Where the person comes from.}
  Bot:
    properties:
      name: text
  Project:
    properties:
      name: {kind: text, required: true}
      status: number
---
