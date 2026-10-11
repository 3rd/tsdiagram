import type { EnumMember } from "ts-morph";
import { projectAlias } from "./aliases";
import { createCompilerContext } from "./compiler-context";
import { cleanName, collectDeclarations, type DeclarationRecord, type EnumRecord } from "./declarations";
import { projectHeritage } from "./heritage";
import { projectMembers, projectMergedAccessors } from "./members";
import { materializeModelGraph } from "./model-graph";
import { projectObjectCalls, projectObjectIndexes } from "./object-signatures";
import type { ModelProjection, ModelReference, ProjectedField } from "./projection";
import { createReferenceResolver } from "./references";
import { projectDeclaredSignature } from "./signatures";
import { collectTypeBindings } from "./type-parameters";

const formatEnumMemberValue = (member: EnumMember) => {
  const value = member.getValue();
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return String(value);

  return member.getInitializer()?.getText() ?? "";
};

const projectEnumMembers = (owner: EnumRecord) => ({
  fields: owner.declarations.flatMap((declaration) =>
    declaration.getMembers().map((member) => ({
      name: cleanName(member.getName()),
      type: formatEnumMemberValue(member),
      optional: false,
    }))
  ),
  references: [],
});

export const parseModels = (source: string) => {
  const compiler = createCompilerContext(source);
  const declarations = collectDeclarations(compiler.sourceFile);
  const references = createReferenceResolver(compiler, declarations);

  const projectDeclaration = (owner: DeclarationRecord) => {
    const context = { owner, compiler, references, typeBindings: collectTypeBindings(owner) };
    const heritage = projectHeritage(owner, context);
    let rows: { fields: ProjectedField[]; references: ModelReference[] }[] = [];

    switch (owner.kind) {
      case "typeAlias": {
        rows = [projectAlias(owner, context)];
        break;
      }
      case "interface": {
        rows = [
          projectMembers(owner, context),
          projectObjectCalls(owner, context),
          projectObjectIndexes(owner, context),
        ];
        break;
      }
      case "class": {
        if (owner.interfaces.length > 0) {
          rows.push(projectMergedAccessors(owner, context), projectObjectCalls(owner, context));
        }

        rows.push(projectObjectIndexes(owner, context), projectMembers(owner, context));
        break;
      }
      case "function": {
        rows = owner.signatures.map((signature) => projectDeclaredSignature(signature, "", context));
        break;
      }
      case "enum": {
        rows = [projectEnumMembers(owner)];
        break;
      }
    }

    const dependencies = new Set([...heritage.references, ...rows.flatMap((row) => row.references)]);
    const projection: ModelProjection = {
      id: owner.id,
      name: owner.name,
      type: owner.kind,
      schema: rows.flatMap((row) => row.fields),
      arguments: heritage.arguments,
      dependencyIds: [...dependencies].map((reference) => reference.id),
      extends: heritage.extends,
      implements: heritage.implements,
      headerRefs: heritage.headerRefs,
      isAbstract: owner.kind === "class" && owner.declaration.isAbstract(),
    };
    return projection;
  };

  return materializeModelGraph(declarations.map(projectDeclaration));
};
