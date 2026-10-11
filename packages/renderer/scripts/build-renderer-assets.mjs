import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);
const rendererDirectory = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory =
  process.argv[2] === undefined
    ? new URL("../dist/assets/", import.meta.url)
    : pathToFileURL(`${path.resolve(process.argv[2])}${path.sep}`);
const stylesheetPath = fileURLToPath(new URL("../src/styles.css", import.meta.url));
const stylesheet = await readFile(stylesheetPath, "utf8");
const compiled = await postcss([tailwindcss({ base: rendererDirectory })]).process(stylesheet, {
  from: stylesheetPath,
  to: fileURLToPath(new URL("styles.css", outputDirectory)),
});

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(new URL("fonts/", outputDirectory), { recursive: true });
await writeFile(new URL("styles.css", outputDirectory), compiled.css);

const fontImports = postcss.parse(await readFile(new URL("../src/fonts.css", import.meta.url), "utf8"));
const fontStylesheets = [];
fontImports.walkAtRules("import", (rule) => {
  fontStylesheets.push(require.resolve(JSON.parse(rule.params)));
});

const fonts = [];

for (const fontStylesheet of fontStylesheets) {
  const stylesheet = postcss.parse(await readFile(fontStylesheet, "utf8"));
  const fontFiles = [];
  stylesheet.walkAtRules("font-face", (rule) => {
    rule.walkDecls("src", (declaration) => {
      const match = declaration.value.match(/url\(([^)]+\.woff2)\)/);
      if (!match) {
        throw new Error(`No WOFF2 source in ${fontStylesheet}`);
      }

      fontFiles.push(path.resolve(path.dirname(fontStylesheet), match[1]));
    });
  });

  for (const fontFile of fontFiles) {
    const filename = path.basename(fontFile);
    const match = filename.match(/^inter-(.+)-(\d+)-normal\.woff2$/);
    if (!match) {
      throw new Error(`Unexpected Inter font filename: ${filename}`);
    }

    const file = `fonts/${filename}`;
    await copyFile(fontFile, new URL(file, outputDirectory));
    fonts.push({ file, weight: Number(match[2]), subset: match[1] });
  }
}

await writeFile(new URL("fonts.json", outputDirectory), `${JSON.stringify(fonts, null, 2)}\n`);
await copyFile(require.resolve("@fontsource/inter/LICENSE"), new URL("inter-license.txt", outputDirectory));
