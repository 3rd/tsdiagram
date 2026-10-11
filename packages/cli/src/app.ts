import cli from "gunsmith";
import { createRenderCommand } from "./render/render-command";

type CliOptions = {
  version: string;
  assetsDirectory: string;
};

export const createCli = ({ version, assetsDirectory }: CliOptions) =>
  cli
    .create("tsdiagram", {
      version,
      description: "Render TypeScript diagrams to SVG and PNG.",
      features: { mcp: false },
    })
    .command(createRenderCommand(assetsDirectory));
