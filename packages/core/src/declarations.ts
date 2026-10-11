import {
  Node,
  type ClassDeclaration,
  type EnumDeclaration,
  type FunctionDeclaration,
  type InterfaceDeclaration,
  type ModuleDeclaration,
  type SourceFile,
  type TypeAliasDeclaration,
} from "ts-morph";

type NamedDeclaration = {
  id: string;
  name: string;
  scope: string[];
};

export type InterfaceRecord = NamedDeclaration & {
  kind: "interface";
  declaration: InterfaceDeclaration;
  declarations: InterfaceDeclaration[];
};

export type ClassRecord = NamedDeclaration & {
  kind: "class";
  declaration: ClassDeclaration;
  interfaces: InterfaceDeclaration[];
};

export type AliasRecord = NamedDeclaration & {
  kind: "typeAlias";
  declaration: TypeAliasDeclaration;
};

export type FunctionRecord = NamedDeclaration & {
  kind: "function";
  declaration: FunctionDeclaration;
  signatures: FunctionDeclaration[];
};

export type EnumRecord = NamedDeclaration & {
  kind: "enum";
  declaration: EnumDeclaration;
  declarations: EnumDeclaration[];
};

export type DeclarationRecord = AliasRecord | ClassRecord | EnumRecord | FunctionRecord | InterfaceRecord;

export type ObjectDeclarationRecord = AliasRecord | ClassRecord | InterfaceRecord;

export const cleanName = (name: string) => name.replace(/["']/g, "");

export const getHeaderTypeParameters = (owner: DeclarationRecord) => {
  const hasHeaderTypeParameters = owner.kind !== "function" && owner.kind !== "enum";
  return hasHeaderTypeParameters ? owner.declaration.getTypeParameters() : [];
};

export const getMergedInterfaces = (owner: DeclarationRecord) => {
  if (owner.kind === "interface") return owner.declarations;
  if (owner.kind === "class") return owner.interfaces;

  return [];
};

export const collectDeclarations = (source: SourceFile) => {
  const interfaces = new Map<string, InterfaceRecord>();
  const aliases: AliasRecord[] = [];
  const functions = new Map<string, FunctionRecord>();
  const classes = new Map<string, ClassRecord>();
  const enums = new Map<string, EnumRecord>();

  const visitContainer = (container: SourceFile | ModuleDeclaration, scope: string[]) => {
    for (const statement of container.getStatements()) {
      const isModelDeclaration =
        Node.isInterfaceDeclaration(statement) ||
        Node.isTypeAliasDeclaration(statement) ||
        Node.isClassDeclaration(statement) ||
        Node.isFunctionDeclaration(statement) ||
        Node.isEnumDeclaration(statement);
      if (!isModelDeclaration) continue;

      const localName = statement.getName();
      if (!localName) continue;

      const name = cleanName([...scope, localName].join("."));
      const identity = { id: name, name, scope };

      if (Node.isInterfaceDeclaration(statement)) {
        const existing = interfaces.get(name);
        if (existing) {
          existing.declarations.push(statement);
        } else {
          interfaces.set(name, {
            ...identity,
            kind: "interface",
            declaration: statement,
            declarations: [statement],
          });
        }
      } else if (Node.isTypeAliasDeclaration(statement)) {
        aliases.push({ ...identity, kind: "typeAlias", declaration: statement });
      } else if (Node.isFunctionDeclaration(statement)) {
        const existing = functions.get(name);
        if (existing) {
          existing.signatures.push(statement);
        } else {
          functions.set(name, {
            ...identity,
            id: `function:${name}`,
            kind: "function",
            declaration: statement,
            signatures: [statement],
          });
        }
      } else if (Node.isClassDeclaration(statement)) {
        if (!classes.has(name)) {
          classes.set(name, { ...identity, kind: "class", declaration: statement, interfaces: [] });
        }
      } else if (Node.isEnumDeclaration(statement)) {
        const existing = enums.get(name);
        if (existing) {
          existing.declarations.push(statement);
        } else {
          enums.set(name, {
            ...identity,
            kind: "enum",
            declaration: statement,
            declarations: [statement],
          });
        }
      }
    }

    for (const module of container.getModules()) {
      visitContainer(module, [...scope, cleanName(module.getName())]);
    }
  };

  visitContainer(source, []);

  for (const classRecord of classes.values()) {
    classRecord.interfaces = interfaces.get(classRecord.name)?.declarations ?? [];
    interfaces.delete(classRecord.name);
  }

  for (const functionRecord of functions.values()) {
    const overloads = functionRecord.signatures.filter((signature) => !signature.hasBody());
    if (overloads.length === 0) continue;

    functionRecord.signatures = overloads;
  }

  const declarations: DeclarationRecord[] = [
    ...interfaces.values(),
    ...aliases,
    ...functions.values(),
    ...classes.values(),
    ...enums.values(),
  ];
  return declarations;
};
