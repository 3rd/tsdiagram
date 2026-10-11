import { Project, ScriptTarget, SyntaxKind } from "ts-morph";

export const createCompilerContext = (source: string) => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.Latest,
      lib: ["lib.esnext.d.ts"],
    },
  });
  const sourceFile = project.createSourceFile("source.ts", source);
  const setterLocation = project
    .createSourceFile("setter-type.ts", '({ property: 0 })["property"] = 0;')
    .getFirstDescendantByKindOrThrow(SyntaxKind.StringLiteral);
  const checker = project.getTypeChecker();

  return { sourceFile, checker, compilerChecker: checker.compilerObject, setterLocation };
};

export type CompilerContext = ReturnType<typeof createCompilerContext>;
