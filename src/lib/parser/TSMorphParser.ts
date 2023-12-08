import {
  ExpressionWithTypeArguments,
  InterfaceDeclaration,
  MethodSignature,
  Project,
  PropertySignature,
  ScriptTarget,
  SourceFile,
  Type,
  TypeAliasDeclaration,
} from "ts-morph";

export type ParsedInterface = {
  name: string;
  declaration: InterfaceDeclaration;
  extends: ExpressionWithTypeArguments[];
  properties: PropertySignature[];
  methods: MethodSignature[];
};

export type ParsedTypeAlias = {
  name: string;
  declaration: TypeAliasDeclaration;
  type: Type;
};

export class Parser {
  project: Project;
  sourceFile: SourceFile;

  constructor(code: string) {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: ScriptTarget.Latest,
        lib: ["lib.esnext.d.ts"],
      },
    });
    const sourceFile = project.createSourceFile("source.ts", code);
    // sourceFile.saveSync();
    this.project = project;
    this.sourceFile = sourceFile;
  }

  setSource(code: string) {
    this.sourceFile.replaceWithText(code);
    // this.sourceFile.saveSync();
  }

  get fs() {
    return this.project.getFileSystem();
  }

  get source() {
    return this.sourceFile;
  }

  get checker() {
    return this.project.getTypeChecker();
  }

  get tsChecker() {
    return this.checker.compilerObject;
  }

  get children() {
    return this.source.getChildren();
  }

  get interfaces(): ParsedInterface[] {
    const result = new Map<string, ParsedInterface>();
    const declarations = this.source.getInterfaces();

    for (const declaration of declarations) {
      const name = declaration.getName();

      const item = result.get(name) ?? { name, declaration, extends: [], properties: [], methods: [] };

      item.extends.push(...declaration.getExtends());
      item.properties.push(...declaration.getProperties());
      item.methods.push(...declaration.getMethods());

      result.set(name, item);
    }

    return Array.from(result.values());
  }

  get typeAliases(): ParsedTypeAlias[] {
    const result: ParsedTypeAlias[] = [];
    const declarations = this.source.getTypeAliases();

    for (const declaration of declarations) {
      const name = declaration.getName();
      const type = declaration.getType();

      result.push({ name, declaration, type });
    }

    return result;
  }
}

// return this.source.getInterfaces().map((declaration) => {
//   return {
//     name: declaration.getName(),
//     declaration,
//     extends: declaration.getExtends(),
//     properties: declaration.getProperties(),
//     methods: declaration.getMethods(),
//   };
// });
//
// // can extend multiple interfaces and classes
// for (const extend of extends_) {
//   const extendName = extend.getText();
//   const extendType = extend.getType();
//   console.log("extendedName:", extendName);
//   console.log("extendedType:", extendType.getText());
//
//   // if extending a interface
//   if (extendType.isInterface()) {
//     const extendDeclaration = extendType.getSymbol()?.getDeclarations()[0] as InterfaceDeclaration;
//     console.log("extendedDeclaration:", extendDeclaration.getText());
//     // const extendedDeclaration = extendedType.getSymbol()?.getDeclarations()[0] as InterfaceDeclaration;
//     // console.log("extendedDeclaration:", extendedDeclaration.getText());
//     // const extendedProperties = extendedDeclaration.getProperties();
//     // const extendedMethods = extendedDeclaration.getMethods();
//   }
// }