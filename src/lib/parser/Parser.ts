import {
  ClassDeclaration,
  ExpressionWithTypeArguments,
  InterfaceDeclaration,
  MethodDeclaration,
  MethodSignature,
  Project,
  PropertyDeclaration,
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

export type ParsedClass = {
  name: string;
  declaration: ClassDeclaration;
  extends?: ExpressionWithTypeArguments;
  properties: PropertyDeclaration[];
  methods: MethodDeclaration[];
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

      const item: ParsedInterface = result.get(name) ?? {
        name,
        declaration,
        extends: [],
        properties: [],
        methods: [],
      };

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

  get classes(): ParsedClass[] {
    const result = new Map<string, ParsedClass>();
    const declarations = this.source.getClasses();

    for (const declaration of declarations) {
      const name = declaration.getName();
      if (!name) continue;

      const item: ParsedClass = result.get(name) ?? {
        name,
        declaration,
        extends: declaration.getExtends(),
        properties: [],
        methods: [],
      };

      item.properties.push(...declaration.getProperties());
      item.methods.push(...declaration.getMethods());

      let baseClass = declaration.getBaseClass();
      while (baseClass) {
        const baseName = baseClass.getName();
        if (!baseName) break;

        item.properties.push(...baseClass.getProperties());
        item.methods.push(...baseClass.getMethods());

        baseClass = baseClass.getBaseClass();
      }

      result.set(name, item);
    }

    return Array.from(result.values());
  }
}
