# TSDiagram

Turn TypeScript into interactive diagrams. Define interfaces, type aliases, classes, enums, and function signatures to see their relationships.

[Open TSDiagram](https://tsdiagram.com)

![TSDiagram screenshot](https://root.b-cdn.net/tsdiagram/media.png)

## Features

- Automatic layout that preserves manually positioned nodes.
- Documents saved in your browser and shareable by URL.
- SVG export from the web app.
- SVG and PNG export from the command line.

## Examples

- [Default example](https://tsdiagram.com/#/N4IgJg9gxgrgtgUwHYBcDOIBcBtUBLMLEACwBsBrAIQEFi4AFAKwEMBGAJwGEEAzU2AO6UAqiAA0IFHhSkERAOoJ+EROJBoIMdlDmYQeVAnY9mOgAQA5CGARngAHSRmzBTGbQp2BgOYBuR84ADswoxG4eXkh+Ae6a2gjhnj7+TmbeCChmiCjMABQAlG4ASghQEOxgADwRPmJmMEjkSBACSAB8Kc7pmVIyCAWJkdGp3WakBuRoA5bWCNgAup1pGWYARqbk441ThTM2C0ujOWiT0wAqzCcHjgC+KY4GKEYm5hcndjG9soPJMVDEeFIYHYyDcb3I11SHhCMDQbns4F4zBgpBQCLMAB8zAjTFIAG4IdFYhGQJCEkCY7EgKDMJA6UiyMAIpZof4IMAohJmcEAZTZHNkLIQaDQeAgSDh3Mu5B5wtF4shXRWeDQAEkkPR2BBvCCRdNVhAILJaSkbo4HoZjKZbLz+ZyPlCcuwUG4ACIhBBLZBgN0ew4rDnsEJipDTJDwVZGf2ZFWcLQg1D6w3GpCm81IR7Pa1Sk6ykUhh3OaHO31PL1IMAAflLnpio0DwfFYYjUbryrQcfYCZQSaNCBNt3TUFIlzQZnkeHIeELZi1EBQ9BCYXcSSi91SZQlnhgUBQ5Vyc4XS5+UXyM+coRVADpD4vQmYALyzw1H0JLM1INsoKw2HZuH9zPM56zhkWhOIqZgfjcagjh4ACy1h4DweDslgrAAOwAAwAEwAGwACwAJwAMzYdhACsrC4Tc8wSLAXbICgrrQPAjGqoQehkFQtAMCwHDcHwggiCANxAA)
- [Interfaces](https://tsdiagram.com/#/N4IgJg9gxgrgtgUwHYBcDOIBcBtUBLMLEAIUgDMBhANwGkBaGgcwE4APATQHcAvAKwCkAqgA0YAQxAAaECjwoANgiIBJVAgBOZMVAQZpaCDHU6ieNZu0IABAEErwADpIrLq2QgRMVtCnVnGANxOAL5OZigaWjq29k6uVojqjAhgXj5+SIEhYeZR1sSxzq4ARmLqXjZBSKFIOREW0RSF8WJeAEoIUBDqYAA86f6StgB8VfHFXgCyYgAOvcRDA5nD2UjhkZZWACLNrq222AC6VTV1G9EAolYIrBFIYGgxjkUupeXevv4nZw3WAGLXW7IB62IYFZ7jMTcNKfTLfWprXKbADivQAKkNBMNdi50l40WNXEh4F5BPD1r8rAAJdGAu4gpaMTFWAC8VmJcGKGmxN3pj1RGKsWJxVgiPhhGSy1SkIHkYh8kwgYDwZDwKSwAEYAOwABgATAA2AAszA1Ro1AA4DXrgodpLB1OpkCgttB4M7lIRMCRyNR6Ew2Fw+EJRBJgkA)
- [Type aliases](https://tsdiagram.com/#/N4IgJg9gxgrgtgUwHYBcDOIBcBtUBLMLEACwCYB2AJQC0BPAMQGYJTSBpALwHEEB1AQ14BRAI4BOEABoQKPCgA2CIgBVaABwQACAILy8-NAgzS0EGACcoSzDPVbtmgLyah58xHOaAZJuAAdJE0gzUMANwRzOVpMTT8QAHd+cyQ8JABzOM0AH1iQCPdzTJy4gDN+FH55OIBuAIBfAJQ7TQAhJx1apEbmgGF2-0Dg-hjtTuDNACMYlrHg8wQoDzAYygWlgB40FEj0yU0AEQA+eoDujQP2rZ206qkQeQMUAFkIMDwSvARCTABGcgAGUgANgALGJSGJyGJGD86gBdaSwNzIFD7aDwFEASW+JAoNAYzFYnB4AmE4hAdSAA)
- [Inheritance and implementation](https://tsdiagram.com/#/N4IgJg9gxgrgtgUwHYBcDOIBcBtUBLMLEAKQFYBJAIwBEAOAOQC8ANAfSloFkAVAZgCsAwlABijAIwgANCBR4UAGwREAogA8UyMGgAEAMh144AByWJUGGWggwATlGWYQUBQEM0ugII7gOgGYQEJg6aCi2eEgA5gDcOgC+ADpILu66AEI+OpSutgAUAJTBoeFRmSgAFrYQAO46SAi1KrZVefmxcfFJKR46gjoIGlpehiZmyOg6Gb7ZrZm2CCh2SDoJINmMq+2dSEkRmrZ+rg46zD5JOhf+gUVhETFJiUh7CAdHCDoAmmfLlzM3JfckI9nq9jgAtfqDJDaE5ST7fS5ZVyMf53aIPaQgNyhTgQMB4Px4BCETDiADsAAYAEwANgALABOXhUqmkcQ0uIAXRksGa42o0Hg43IJJIFBoDBY7C4fCEogkIDiQA)

## CLI

The `tsdiagram` CLI reads TypeScript from files, stdin, or inline code. It renders SVG and PNG with Takumi, sharing the web app's card presentation, fonts, themes, layout, and edge routing.

It requires Node.js 22.12 or later. Rendering runs locally without a browser or web server. CLI SVG text is stored as vector outlines; the web app's SVG export retains selectable text.

```sh
tsdiagram render domain.ts -o diagram.svg --png
cat domain.ts | tsdiagram render
tsdiagram render --code 'interface User { id: string }' -o user.svg
```

The first command writes `diagram.svg` and `diagram.png`. Piped stdin and inline code default to `diagram.svg` in the current directory. Use `-o` or `--output` to choose another path for any input mode. Positional output paths remain supported, but cannot be combined with `-o`/`--output`.

See the [CLI guide](packages/cli/README.md) for installation and options, or run `tsdiagram render --help`. To run it from this checkout, use the build commands below.

## Development

Use Node.js 22.12 or later and pnpm 10.14.0. From the repository root, install dependencies and start the web app:

```sh
pnpm install
pnpm dev
```

Other commands, run from the repository root:

- `pnpm test:run` runs tests once; `pnpm test` runs them in watch mode.
- `pnpm typecheck` checks TypeScript across the workspace.
- `pnpm build` checks types and builds all packages. The web build is written to `packages/web/dist/`.
- `pnpm preview` previews the production web build.

After installing dependencies, build and run the CLI from its package directory:

```sh
cd packages/cli
pnpm build
node dist/cli.js --help
```

This also builds and bundles the renderer.

## Packages

- [`core`](packages/core): TypeScript analysis and diagram models.
- [`renderer`](packages/renderer): shared diagram presentation, browser rendering, and browser-free Takumi export.
- [`web`](packages/web): editor, documents, preferences, and sharing.
- [`cli`](packages/cli): Gunsmith commands, render-process lifecycle, and file export.

Tests live beside the code they cover. Shared browser build configuration lives in [`build/browser-config.ts`](build/browser-config.ts). The CLI is packaged for npm as `tsdiagram`; core and renderer are internal packages.

## Roadmap

- Function call visualization.
- Configurable TypeScript context, including libraries.
- Support for other document storage providers.
- Move to Tree-sitter to support broader code and data-flow visualization.

## Special thanks

- [TypeScript](https://www.typescriptlang.org/)
- [React Flow](https://reactflow.dev)
- [Monaco](https://github.com/microsoft/monaco-editor)
- [elkjs](https://github.com/kieler/elkjs)
- [dom-to-svg](https://github.com/felixfbecker/dom-to-svg)
- [Takumi](https://takumi.kane.tw/)
