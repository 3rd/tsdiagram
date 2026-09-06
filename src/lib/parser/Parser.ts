import {
  CallSignatureDeclaration,
  ClassDeclaration,
  ConstructSignatureDeclaration,
  EnumDeclaration,
  EnumMember,
  ExpressionWithTypeArguments,
  IndexSignatureDeclaration,
  InterfaceDeclaration,
  MethodDeclaration,
  MethodSignature,
  ModuleDeclaration,
  Project,
  PropertyDeclaration,
  PropertySignature,
  ScriptTarget,
  SourceFile,
  SyntaxKind,
  Symbol as TsMorphSymbol,
  Type,
  TypeAliasDeclaration,
} from "ts-morph";

export type ParsedInterface = {
  name: string;
  declaration: InterfaceDeclaration;
  extends: ExpressionWithTypeArguments[];
  properties: PropertySignature[];
  methods: MethodSignature[];
  members: (MethodSignature | PropertySignature | TsMorphSymbol)[];
  callSignatures: CallSignatureDeclaration[];
  constructSignatures: ConstructSignatureDeclaration[];
  indexSignatures: IndexSignatureDeclaration[];
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
  implements: ExpressionWithTypeArguments[];
  properties: (PropertyDeclaration | PropertySignature)[];
  methods: (MethodDeclaration | MethodSignature)[];
};

export type ParsedEnum = {
  name: string;
  declaration: EnumDeclaration;
  members: EnumMember[];
};

type QualifiedModule = {
  module: ModuleDeclaration;
  name: string;
};

type QualifiedDeclaration<T> = {
  declaration: T;
  moduleName: string | null;
};

const collectQualifiedModules = (modules: ModuleDeclaration[], parentName = ""): QualifiedModule[] => {
  const result: QualifiedModule[] = [];

  for (const module of modules) {
    const name = parentName ? `${parentName}.${module.getName()}` : module.getName();
    result.push({ module, name });
    result.push(...collectQualifiedModules(module.getModules(), name));
  }

  return result;
};

const collectQualifiedDeclarations = <T>(
  declarations: T[],
  modules: ModuleDeclaration[],
  getModuleDeclarations: (module: ModuleDeclaration) => T[],
): QualifiedDeclaration<T>[] => {
  const result: QualifiedDeclaration<T>[] = declarations.map((declaration) => ({
    declaration,
    moduleName: null,
  }));

  for (const { module, name: moduleName } of collectQualifiedModules(modules)) {
    result.push(...getModuleDeclarations(module).map((declaration) => ({ declaration, moduleName })));
  }

  return result;
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
    this.project = project;
    this.sourceFile = sourceFile;
  }

  setSource(code: string) {
    this.sourceFile.replaceWithText(code);
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
    const result = new Map<
      string,
      {
        interface: ParsedInterface;
        propertyNames: Set<string>;
        methodNames: Set<string>;
      }
    >();
    const declarations = collectQualifiedDeclarations(
      this.source.getInterfaces(),
      this.source.getModules(),
      (module) => module.getInterfaces(),
    );
    const declarationMembersMap = new Map<string, Set<string>>();

    for (const { moduleName, declaration } of declarations) {
      const name = moduleName ? `${moduleName}.${declaration.getName()}` : declaration.getName();

      const declarationMembers = declarationMembersMap.get(name) ?? new Set<string>();
      for (const member of declaration.getProperties()) {
        declarationMembers.add(member.getName());
      }
      for (const member of declaration.getMethods()) {
        declarationMembers.add(member.getName());
      }
      declarationMembersMap.set(name, declarationMembers);

      const item = result.get(name) ?? {
        interface: {
          name,
          declaration,
          extends: [],
          properties: [],
          methods: [],
          members: [],
          callSignatures: [],
          constructSignatures: [],
          indexSignatures: [],
        },
        propertyNames: new Set(),
        methodNames: new Set(),
      };

      item.interface.extends.push(...declaration.getExtends());
      item.interface.callSignatures.push(...declaration.getCallSignatures());
      item.interface.constructSignatures.push(...declaration.getConstructSignatures());
      item.interface.indexSignatures.push(...declaration.getIndexSignatures());
      result.set(name, item);

      const checkerType = this.checker.getTypeAtLocation(declaration);
      const checkerProperties = checkerType.getProperties();
      for (const property of checkerProperties) {
        const propertyName = property.getName();
        const valueDeclaration = property.getValueDeclaration();
        if (!valueDeclaration) {
          if (item.propertyNames.has(propertyName)) continue;
          item.interface.members.push(property);
          item.propertyNames.add(propertyName);
          continue;
        }
        if (!checkerType.isInterface()) continue;

        if (valueDeclaration.getKindName() === "PropertySignature") {
          if (item.propertyNames.has(propertyName)) {
            continue;
          }
          item.interface.properties.push(valueDeclaration as PropertySignature);
          item.interface.members.push(valueDeclaration as PropertySignature);
          item.propertyNames.add(propertyName);
        } else if (valueDeclaration.getKindName() === "MethodSignature") {
          if (item.methodNames.has(propertyName)) {
            continue;
          }
          item.interface.methods.push(valueDeclaration as MethodSignature);
          item.interface.members.push(valueDeclaration as MethodSignature);
          item.methodNames.add(propertyName);
        }
      }
    }

    // move declaration members after other members
    const items = Array.from(result.values()).map(({ interface: item }) => item);
    for (const item of items) {
      const declarationMembers = declarationMembersMap.get(item.name);
      if (!declarationMembers) continue;
      const inheritedMemberOrder = new Map<string, number>();
      for (const extended of item.extends) {
        for (const property of extended.getType().getProperties()) {
          const propertyName = property.getName();
          if (!inheritedMemberOrder.has(propertyName)) {
            inheritedMemberOrder.set(propertyName, inheritedMemberOrder.size);
          }
        }
      }
      item.members.sort((a, b) => {
        const aName = a.getName();
        const bName = b.getName();
        const aIsDeclarationMember = declarationMembers.has(aName);
        const bIsDeclarationMember = declarationMembers.has(bName);
        if (aIsDeclarationMember && !bIsDeclarationMember) {
          return 1;
        } else if (!aIsDeclarationMember && bIsDeclarationMember) {
          return -1;
        }
        if (aIsDeclarationMember && bIsDeclarationMember) return 0;
        const aOrder = inheritedMemberOrder.get(aName);
        const bOrder = inheritedMemberOrder.get(bName);
        if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
        if (aOrder !== undefined) return -1;
        if (bOrder !== undefined) return 1;
        return 0;
      });
    }

    return items;
  }

  get enums(): ParsedEnum[] {
    const result = new Map<string, ParsedEnum>();
    const declarations = collectQualifiedDeclarations(
      this.source.getEnums(),
      this.source.getModules(),
      (module) => module.getEnums(),
    );

    for (const { moduleName, declaration } of declarations) {
      const name = moduleName ? `${moduleName}.${declaration.getName()}` : declaration.getName();
      const item = result.get(name) ?? { name, declaration, members: [] };
      item.members.push(...declaration.getMembers());
      result.set(name, item);
    }

    return Array.from(result.values());
  }

  get typeAliases(): ParsedTypeAlias[] {
    const result: ParsedTypeAlias[] = [];
    const declarations = collectQualifiedDeclarations(
      this.source.getTypeAliases(),
      this.source.getModules(),
      (module) => module.getTypeAliases(),
    );

    for (const { declaration, moduleName } of declarations) {
      const name = moduleName ? `${moduleName}.${declaration.getName()}` : declaration.getName();
      const type = declaration.getType();

      result.push({ name, declaration, type });
    }

    return result;
  }

  get classes(): ParsedClass[] {
    const result = new Map<
      string,
      {
        class: ParsedClass;
        propertyNames: Set<string>;
        methodNames: Set<string>;
      }
    >();
    const declarations = collectQualifiedDeclarations(
      this.source.getClasses(),
      this.source.getModules(),
      (module) => module.getClasses(),
    );

    for (const { declaration, moduleName } of declarations) {
      const name = moduleName ? `${moduleName}.${declaration.getName()}` : declaration.getName();
      if (!name) continue;

      const item = result.get(name) ?? {
        class: {
          name,
          declaration,
          extends: declaration.getExtends(),
          implements: declaration.getImplements(),
          properties: [],
          methods: [],
        },
        propertyNames: new Set(),
        methodNames: new Set(),
      };

      const checkerType = this.checker.getTypeAtLocation(declaration);

      for (const property of checkerType.getProperties()) {
        const propertyName = property.getName();
        const valueDeclaration = property.getValueDeclaration();
        if (!valueDeclaration) continue;

        if (
          valueDeclaration.getKindName() === "PropertySignature" ||
          valueDeclaration.getKindName() === "PropertyDeclaration"
        ) {
          if (item.propertyNames.has(propertyName)) continue;
          item.class.properties.push(valueDeclaration as PropertySignature);
          item.propertyNames.add(propertyName);
        } else if (
          valueDeclaration.getKindName() === "MethodSignature" ||
          valueDeclaration.getKindName() === "MethodDeclaration"
        ) {
          if (item.methodNames.has(propertyName)) continue;
          item.class.methods.push(valueDeclaration as MethodSignature);
          item.methodNames.add(propertyName);
        }
      }

      for (const staticProperty of declaration.getStaticProperties()) {
        if (!staticProperty.isKind(SyntaxKind.PropertyDeclaration)) continue;
        const key = `static:${staticProperty.getName()}`;
        if (item.propertyNames.has(key)) continue;
        item.class.properties.push(staticProperty);
        item.propertyNames.add(key);
      }
      for (const staticMethod of declaration.getStaticMethods()) {
        const key = `static:${staticMethod.getName()}`;
        if (item.methodNames.has(key)) continue;
        item.class.methods.push(staticMethod);
        item.methodNames.add(key);
      }

      result.set(name, item);
    }

    return Array.from(result.values()).map(({ class: item }) => item);
  }
}
