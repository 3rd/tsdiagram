/* eslint-disable react/jsx-key */
/* eslint-disable no-nested-ternary */
import { useMemo, useRef } from "react";
import { Model, ModelParser, isArraySchemaField, isGenericSchemaField } from "../lib/parser/ModelParser";

type ModelCardProps = {
  model: Model;
};

const ModelCard = ({ model }: ModelCardProps) => {
  const fieldRows = useMemo(() => {
    return model.schema.map((field) => {
      const typeFragments: JSX.Element[] = [];

      const classNames = {
        default: "text-gray-500",
        model: "text-blue-700",
      };

      // model reference
      if (field.type instanceof Object) {
        typeFragments.push(<span className={classNames.model}>{field.type.name}</span>);
      }
      // array
      else if (isArraySchemaField(field)) {
        // of model references
        if (field.elementType instanceof Object) {
          typeFragments.push(<span className={classNames.model}>{field.elementType.name}[]</span>);
        } else {
          // of primitives
          typeFragments.push(<span className={classNames.default}>{`${field.elementType}[]`}</span>);
        }
      } else if (isGenericSchemaField(field)) {
        // generics
        typeFragments.push(<span className={classNames.default}>{`${field.genericName}<`}</span>);
        for (const argument of field.arguments) {
          // of model references
          if (argument instanceof Object) {
            typeFragments.push(<span className={classNames.model}>{argument.name}</span>);
          } else {
            // of primitives
            typeFragments.push(<span className={classNames.default}>{argument}</span>);
          }
        }
        typeFragments.push(<span className={classNames.default}>{">"}</span>);
      } else {
        // default
        typeFragments.push(<span className={classNames.default}>{field.type}</span>);
      }

      return (
        <tr>
          <td className="pl-1">{field.name}</td>
          <td align="right" className="pr-1">
            {typeFragments}
          </td>
        </tr>
      );
    });
  }, [model]);

  return (
    <div className="border border-blue-700">
      {/* header */}
      <div className="px-1 text-white bg-blue-700">{model.name}</div>
      {/* fields */}
      <div className="flex flex-col text-sm bg-white">
        <table cellPadding="1" className="gap-1">
          <tbody>{fieldRows}</tbody>
        </table>
      </div>
    </div>
  );
};

export type BasicRendererProps = {
  source: string;
};

export const BasicRenderer = ({ source }: BasicRendererProps) => {
  const parser = useRef<ModelParser>(new ModelParser(source));

  const models = useMemo(() => {
    parser.current.setSource(source);
    return parser.current.getModels();
  }, [source]);

  console.log("models:", models);

  return (
    <div className="flex overflow-auto flex-col gap-2 w-full h-full">
      {models.map((model) => (
        <ModelCard model={model} />
      ))}
    </div>
  );
};
