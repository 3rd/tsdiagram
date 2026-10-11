import { writeFile } from "node:fs/promises";
import path from "node:path";

let input = "";
process.stdin.setEncoding("utf8");

for await (const chunk of process.stdin) {
  input += chunk;
}

const request = JSON.parse(input);
await writeFile(path.join(request.assetsDirectory, "worker.pid"), String(process.pid));
await writeFile(path.join(request.assetsDirectory, "worker.ready"), "");

if (request.source === "hang") {
  while (true) {}
}

if (request.source === "error") {
  process.stdout.write(JSON.stringify({ ok: false, error: "Could not lay out diagram" }));
  process.exitCode = 1;
} else if (request.source === "malformed") {
  process.stdout.write(JSON.stringify({ ok: true, svg: "<svg/>", width: -1, height: 80, png: null }));
} else if (request.source === "invalid binary") {
  process.stdout.write(
    JSON.stringify({
      ok: true,
      svg: "<svg/>",
      width: 120,
      height: 80,
      png: { base64: "not binary!", width: 240, height: 160 },
    })
  );
} else {
  process.stdout.write(
    JSON.stringify({
      ok: true,
      svg: `<svg><metadata>${request.source}</metadata></svg>`,
      width: 120,
      height: 80,
      png:
        request.png === undefined
          ? null
          : {
              base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
              width: 240,
              height: 160,
            },
    })
  );
}
