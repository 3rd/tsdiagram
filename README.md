# TSDiagram

**TSDiagram** is an online tool that helps you draft diagrams quickly by using TypeScript.
\
:point_right: https://tsdiagram.com

### **Features**

- Lets you define your data models through **top-level type aliases**, **interfaces**, and **classes**.
- Automatically layouts the nodes in an efficient way.
- ...but if you move one of the nodes manually, it will only auto-layout the other ones.
- Persists the document state in the URL and localStorage.
- Export your diagrams as SVG.

### **Roadmap**

- Function call representation
- Customizable TypeScript context (lib, etc.)
- Bring your own storage (different vendors)

---

> This project is not just a diagramming tool, but also the foundation for a greater code visualization project.
> Imagine flagging types and functions in your code editor and see how they are connected, and how data flows through them.
> That's the end goal, so we'll swap the TS compiler with Tree-sitter in the process.

---

![TSDiagram Screenshot](https://root.b-cdn.net/tsdiagram/media.png)

### Test links

- [Default example](https://tsdiagram.com/#/N4IgJg9gxgrgtgUwHYBcDOIBcBtUBLMLEACwBsBrAIQEFi4AFAKwEMBGAJwGEEAzU2AO6UAqiAA0IFHhSkERAOoJ+EROJBoIMdlDmYQeVAnY9mOgAQA5CGARngAHSRmzBTGbQp2BgOYBuR84ADswoxG4eXkh+Ae6a2gjhnj7+TmbeCChmiCjMABQAlG4ASghQEOxgADwRPmJmMEjkSBACSAB8Kc7pmVIyCAWJkdGp3WakBuRoA5bWCNgAup1pGWYARqbk441ThTM2C0ujOWiT0wAqzCcHjgC+KY4GKEYm5hcndjG9soPJMVDEeFIYHYyDcb3I11SHhCMDQbns4F4zBgpBQCLMAB8zAjTFIAG4IdFYhGQJCEkCY7EgKDMJA6UiyMAIpZof4IMAohJmcEAZTZHNkLIQaDQeAgSDh3Mu5B5wtF4shXRWeDQAEkkPR2BBvCCRdNVhAILJaSkbo4HoZjKZbLz+ZyPlCcuwUG4ACIhBBLZBgN0ew4rDnsEJipDTJDwVZGf2ZFWcLQg1D6w3GpCm81IR7Pa1Sk6ykUhh3OaHO31PL1IMAAflLnpio0DwfFYYjUbryrQcfYCZQSaNCBNt3TUFIlzQZnkeHIeELZi1EBQ9BCYXcSSi91SZQlnhgUBQ5Vyc4XS5+UXyM+coRVADpD4vQmYALyzw1H0JLM1INsoKw2HZuH9zPM56zhkWhOIqZgfjcagjh4ACy1h4DweDslgrAAOwAAwAEwAGwACwAJwAMzYdhACsrC4Tc8wSLAXbICgrrQPAjGqoQehkFQtAMCwHDcHwggiCANxAA)
- [Interfaces](https://tsdiagram.com/#/N4IgJg9gxgrgtgUwHYBcDOIBcBtUBLMLEAIUgDMBhANwGkBaGgcwE4APATQHcAvAKwCkAqgA0YAQxAAaECjwoANgiIBJVAgBOZMVAQZpaCDHU6ieNZu0IABAEErwADpIrLq2QgRMVtCnVnGANxOAL5OZigaWjq29k6uVojqjAhgXj5+SIEhYeZR1sSxzq4ARmLqXjZBSKFIOREW0RSF8WJeAEoIUBDqYAA86f6StgB8VfHFXgCyYgAOvcRDA5nD2UjhkZZWACLNrq222AC6VTV1G9EAolYIrBFIYGgxjkUupeXevv4nZw3WAGLXW7IB62IYFZ7jMTcNKfTLfWprXKbADivQAKkNBMNdi50l40WNXEh4F5BPD1r8rAAJdGAu4gpaMTFWAC8VmJcGKGmxN3pj1RGKsWJxVgiPhhGSy1SkIHkYh8kwgYDwZDwKSwAEYAOwABgATAA2AAszA1Ro1AA4DXrgodpLB1OpkCgttB4M7lIRMCRyNR6Ew2Fw+EJRBJgkA)
- [Type aliases](https://tsdiagram.com/#/N4IgJg9gxgrgtgUwHYBcDOIBcBtUBLMLEACwCYB2AJQC0BPAMQGYJTSBpALwHEEB1AQ14BRAI4BOEABoQKPCgA2CIgBVaABwQACAILy8-NAgzS0EGACcoSzDPVbtmgLyah58xHOaAZJuAAdJE0gzUMANwRzOVpMTT8QAHd+cyQ8JABzOM0AH1iQCPdzTJy4gDN+FH55OIBuAIBfAJQ7TQAhJx1apEbmgGF2-0Dg-hjtTuDNACMYlrHg8wQoDzAYygWlgB40FEj0yU0AEQA+eoDujQP2rZ206qkQeQMUAFkIMDwSvARCTABGcgAGUgANgALGJSGJyGJGD86gBdaSwNzIFD7aDwFEASW+JAoNAYzFYnB4AmE4hAdSAA)
- [Interfaces and classes extends & implements](https://tsdiagram.com/#/N4IgJg9gxgrgtgUwHYBcDOIBcBtUBLMLEAKQFYBJAIwBEAOAOQC8ANAfSloFkAVAZgCsAwlABijAIwgANCBR4UAGwREAogA8UyMGgAEAMh144AByWJUGGWggwATlGWYQUBQEM0ugII7gOgGYQEJg6aCi2eEgA5gDcOgC+ADpILu66AEI+OpSutgAUAJTBoeFRmSgAFrYQAO46SAi1KrZVefmxcfFJKR46gjoIGlpehiZmyOg6Gb7ZrZm2CCh2SDoJINmMq+2dSEkRmrZ+rg46zD5JOhf+gUVhETFJiUh7CAdHCDoAmmfLlzM3JfckI9nq9jgAtfqDJDaE5ST7fS5ZVyMf53aIPaQgNyhTgQMB4Px4BCETDiADsAAYAEwANgALABOXhUqmkcQ0uIAXRksGa42o0Hg43IJJIFBoDBY7C4fCEogkIDiQA)

### Special thanks <3

- [TypeScript](https://www.typescriptlang.org/)
- [React Flow](https://reactflow.dev)
- [Monaco](https://github.com/microsoft/monaco-editor)
- [elkjs](https://github.com/kieler/elkjs)
- [dom-to-svg](https://github.com/felixfbecker/dom-to-svg)
