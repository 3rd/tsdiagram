import { ts, type ExpressionWithTypeArguments } from "ts-morph";
import { getHeaderTypeParameters, getMergedInterfaces, type DeclarationRecord } from "./declarations";
import type { DisplayValue, ModelReference } from "./projection";
import { trimSourcePath } from "./references";
import type { ProjectionContext } from "./type-display";
import { collectParameterReferences, projectTypeParameter } from "./type-parameters";

const collectHeritageReferences = (expression: ExpressionWithTypeArguments, context: ProjectionContext) => {
  const head = expression.getExpression();
  const nodes = [head, ...expression.getDescendantsOfKind(ts.SyntaxKind.TypeReference)];

  return nodes.flatMap((node) => {
    const reference = context.references.resolveNested({
      text: node.getText(),
      type: node.getType(),
      owner: context.owner,
    });
    return reference ? [reference] : [];
  });
};

export const projectHeritage = (owner: DeclarationRecord, context: ProjectionContext) => {
  const parameters = getHeaderTypeParameters(owner);
  const argumentsList = parameters.map(projectTypeParameter);
  const extendsValues: DisplayValue[] = [];
  const implementsValues: DisplayValue[] = [];
  const references = new Set<ModelReference>();
  const headerRefs = new Set<ModelReference>();

  const resolveHeritage = (expression: ExpressionWithTypeArguments) => {
    const text = trimSourcePath(expression.getText());
    return context.references.resolveExact({ text, type: expression.getType(), owner }) ?? text;
  };

  if (owner.kind === "class") {
    const base = owner.declaration.getExtends() ?? owner.interfaces[0]?.getExtends()[0];
    if (base) {
      extendsValues.push(resolveHeritage(base));
    }

    implementsValues.push(...owner.declaration.getImplements().map(resolveHeritage));
  }

  for (const declaration of getMergedInterfaces(owner)) {
    for (const reference of collectParameterReferences(declaration.getTypeParameters(), context)) {
      references.add(reference);
      headerRefs.add(reference);
    }

    for (const expression of declaration.getExtends()) {
      const value = resolveHeritage(expression);

      if (owner.kind === "interface") {
        extendsValues.push(value);
      }

      if (typeof value !== "string") {
        references.add(value);

        const hasSeparateClassBase = owner.kind === "class" && extendsValues[0] !== value;
        if (hasSeparateClassBase) {
          headerRefs.add(value);
        }
      } else {
        for (const reference of collectHeritageReferences(expression, context)) {
          references.add(reference);
          headerRefs.add(reference);
        }
      }
    }
  }

  const shouldCollectOwnParameters = owner.kind === "typeAlias" || owner.kind === "class";
  if (shouldCollectOwnParameters) {
    for (const reference of collectParameterReferences(parameters, context)) {
      references.add(reference);

      if (owner.kind !== "class") continue;

      headerRefs.add(reference);
    }
  }

  if (owner.kind === "class") {
    const base = owner.declaration.getExtends();
    const expressions = [...(base ? [base] : []), ...owner.declaration.getImplements()];

    for (const expression of expressions) {
      const value = resolveHeritage(expression);
      if (typeof value !== "string") {
        references.add(value);
      } else {
        for (const reference of collectHeritageReferences(expression, context)) {
          references.add(reference);
          headerRefs.add(reference);
        }
      }
    }
  }

  return {
    arguments: argumentsList,
    extends: extendsValues,
    implements: implementsValues,
    headerRefs: [...headerRefs],
    references: [...references],
  };
};
