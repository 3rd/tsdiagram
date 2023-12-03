import ts from "typescript";

const SOURCE_FILENAME = "source.tsx";

const bootstrap = (code: string) => {
  const source = ts.createSourceFile(SOURCE_FILENAME, code, ts.ScriptTarget.Latest, true);
  const compilerHost: ts.CompilerHost = {
    getSourceFile: (path) => {
      if (path === SOURCE_FILENAME) return source;
      console.error("compilerHost.getSourceFile:", path);
    },
    writeFile: () => {},
    getDefaultLibFileName: () => "",
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => "",
    getNewLine: () => "\n",
    getDirectories: () => [],
    fileExists: () => true,
    readFile: () => "",
  };
  const program = ts.createProgram([SOURCE_FILENAME], {}, compilerHost);
  return { source, program };
};

export class Parser {
  source: ts.SourceFile;
  program: ts.Program;

  constructor(code: string) {
    const { source, program } = bootstrap(code);
    this.source = source;
    this.program = program;
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  setSource(code: string) {
    const { source, program } = bootstrap(code);
    this.source = source;
    this.program = program;
  }

  get checker() {
    return this.program.getTypeChecker();
  }

  getNodes(kind?: ts.SyntaxKind) {
    const nodes: ts.Node[] = [];
    const visit = (node: ts.Node) => {
      if (!kind || node.kind === kind) nodes.push(node);
      ts.forEachChild(node, visit);
    };
    visit(this.source);
    return nodes;
  }

  getTopLevelNodes() {
    return this.getNodes().filter(
      (node) => node.parent?.kind === ts.SyntaxKind.SourceFile && node.kind !== ts.SyntaxKind.EndOfFileToken
    );
  }
}
