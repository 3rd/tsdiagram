# TSDiagram CLI

Render TypeScript interfaces, type aliases, classes, enums, and functions as SVG diagrams. Read code from a file, stdin, or an inline string. Add `--png` to produce a PNG from the same SVG.

## Install

Install Node.js 22.12 or later, then install the CLI:

```sh
npm install --global tsdiagram
```

The package contains its own Takumi diagram renderer and fonts. SVG text uses portable outlines. Rendering runs in a separate Node process and does not need a running TSDiagram application or a browser.

## Render a diagram

Save a TypeScript file such as `domain.ts`:

```ts
interface Person {
  name: string;
}

interface Team {
  members: Person[];
}
```

Run the renderer:

```sh
tsdiagram render domain.ts
tsdiagram render domain.ts -o diagram.svg --png
```

The first command writes `domain.svg`. The second writes `diagram.svg` and `diagram.png`. Successful commands print the written paths. If an output already exists, an interactive run asks before replacing it and defaults to no. With piped TypeScript input, confirmation reads from the terminal instead of stdin. JSON and noninteractive runs refuse to replace existing files unless you pass `--force`.

Confirmation covers all existing SVG and PNG outputs before rendering or writing either file. Declining leaves the files unchanged. `--force` skips confirmation, but an output that points to the input file is still rejected. SVG and PNG outputs cannot point to the same file.

## Read stdin or inline code

Omit the input argument to read piped or redirected TypeScript until EOF. The default output is `diagram.svg` in the current directory:

```sh
cat domain.ts | tsdiagram render
tsdiagram render < domain.ts
```

Use `-o` or `--output` to choose an output path:

```sh
cat domain.ts | tsdiagram render -o team.svg --png
```

Use `--code` to pass a TypeScript string. Like stdin, it defaults to `diagram.svg` in the current directory:

```sh
tsdiagram render --code 'interface User { id: string }'
tsdiagram render --code 'interface User { id: string }' --output user.svg --png
```

`--code` cannot be combined with a file input or `-`. File and `--code` modes do not read stdin. Without a file or inline code, piped or redirected stdin is required. Source text is preserved, including Unicode and newlines; empty source is accepted just like an empty input file.

Positional output paths remain supported: `tsdiagram render domain.ts diagram.svg`, `tsdiagram render - diagram.svg`, and `tsdiagram render --code 'interface User {}' diagram.svg`. Choose either a positional output path or `-o`/`--output`; supplying both is an error.

## Options

Use `tsdiagram render --help` for generated help.

- `[input]` is the TypeScript input file. Omit it or use `-` to read stdin. With `--code`, this positional argument is an optional SVG output path instead.
- `[outputPath]` is the positional SVG output path for file or stdin input, as an alternative to `-o`/`--output`.
- `-o`, `--output` sets the SVG output path for file, stdin, or inline-code input. File input defaults to replacing the input's TypeScript extension with `.svg`; stdin and inline code default to `diagram.svg` in the current directory.
- `--code` supplies inline TypeScript source instead of a file or stdin.
- `--png` also writes a PNG. The PNG path replaces a trailing `.svg` with `.png`, or appends `.png` to any other output filename.
- `--force` overwrites existing SVG and PNG output files without confirmation. New files are created without prompting.
- `--scale` sets the requested PNG scale factor. The default is `2`.
- `--max-side` caps the PNG's longer side in pixels. The default is `4096`.
- `--timeout` sets the operation deadline in seconds, including time spent waiting for stdin. The default is `60`.
- `--verbose` reports rendering progress.
- `--json` returns one structured JSON result instead of human-readable output.

Numeric options must be positive and finite. `--max-side` must be an integer. Quote filenames that contain spaces or shell-special characters.

```sh
tsdiagram render domain.ts -o "diagrams/team #1.svg" --png --scale 3 --max-side 2048
tsdiagram render domain.ts --json
tsdiagram render --schema
```

JSON success reports `input` as the resolved file path for file input, or `null` for stdin and inline code. It also reports the SVG path, byte count, dimensions, and either PNG metadata or `null`. Source code is not included in the result. Failure returns `{ "ok": false, "error": { "code": "…", "message": "…" } }`. Exit codes are `0` for success, `2` for argument or input/output-usage errors, and `1` for rendering failures, timeout, or cancellation.

## Troubleshooting

If rendering times out, inspect the reported error and source file. Increase `--timeout` for a diagram that needs more processing time. Each invocation waits for its renderer process to close on completion. Timeout and SIGINT, SIGTERM, or SIGHUP cancellation terminate that process before returning an error.

The replacement command is `tsdiagram render`. The former `tsdiagram-export` command and its `--url` option are no longer used.

## Build from the repository

From the monorepo root, install dependencies and build the packages:

```sh
pnpm install
pnpm build
pnpm pack:cli
```

The CLI build compiles the command and rendering worker, includes the renderer's styles and fonts, and copies the repository license into the npm package. Packing runs the renderer and CLI builds. The tarball is ready for a clean-install check; packing does not publish it.
