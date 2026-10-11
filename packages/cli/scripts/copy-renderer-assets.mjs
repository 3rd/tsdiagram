import { chmod, copyFile, cp, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const source = new URL("../../renderer/dist/assets/", import.meta.url);
const entrypoint = new URL("styles.css", source);
await stat(entrypoint);
await cp(source, new URL("../dist/renderer/", import.meta.url), { recursive: true });
await copyFile(new URL("../../../LICENSE", import.meta.url), new URL("../LICENSE", import.meta.url));

const require = createRequire(new URL("../../renderer/package.json", import.meta.url));
const notices = await Promise.all(
  ["classnames", "tailwindcss", "@xyflow/react"].map(async (packageName) => {
    const packageDirectory = path.dirname(require.resolve(`${packageName}/package.json`));
    const license = await readFile(path.join(packageDirectory, "LICENSE"), "utf8");
    return `${packageName}\n\n${license}`;
  })
);
await writeFile(new URL("../dist/THIRD-PARTY-NOTICES.txt", import.meta.url), notices.join("\n\n"));

await chmod(new URL("../dist/cli.js", import.meta.url), 0o755);
