import { useMemo } from "react";
import { Handle, Position } from "reactflow";
import { Model } from "../../lib/parser/ModelParser";
import { CustomHandle } from "./CustomHandle";

export type ModelNodeProps = {
  id: string;
  data: { model: Model };
};

export const ModelNode = ({ id, data }: ModelNodeProps) => {
  const { model } = data;

  const hasTargetHandle = useMemo(() => model.dependants.length > 0, [model.dependants]);

  const fieldRows = useMemo(() => {
    return model.schema.map((field) => {
      const typeFragments: JSX.Element[] = [];

      const classNames = {
        default: "text-gray-500",
        model: "text-blue-700",
      };

      let hasFieldSourceHandle = false;

      // model reference
      if (field.type instanceof Object) {
        hasFieldSourceHandle = true;
        typeFragments.push(
          <span key="reference" className={classNames.model}>
            {field.type.name}
          </span>
        );
      }
      // array
      else if (field.type === "array" && "elementType" in field) {
        // of model references
        if (field.elementType instanceof Object) {
          hasFieldSourceHandle = true;
          typeFragments.push(
            <span key="array-reference" className={classNames.model}>
              {field.elementType.name}[]
            </span>
          );
        } else {
          // of primitives
          typeFragments.push(
            <span key="array-primitive" className={classNames.default}>{`${field.elementType}[]`}</span>
          );
        }
        // map
      } else if (field.type === "map" && "keyType" in field && "valueType" in field) {
        // of model references
        if (field.valueType instanceof Object) {
          hasFieldSourceHandle = true;
          typeFragments.push(
            <span
              key="map-reference"
              className={classNames.model}
            >{`Map<${field.keyType}, ${field.valueType.name}>`}</span>
          );
        } else {
          // of primitives
          typeFragments.push(
            <span
              key="map-primitive"
              className={classNames.default}
            >{`Map<${field.keyType}, ${field.valueType}>`}</span>
          );
        }
      } else {
        // default
        typeFragments.push(
          <span key="default" className={classNames.default}>
            {field.type}
          </span>
        );
      }

      return (
        <tr key={`${model.id}-${field.name}`} className="even:bg-gray-100">
          <td className="pr-2 pl-1 leading-none">{field.name}</td>
          <td align="right" className="relative pr-1 leading-none">
            {typeFragments}
            {hasFieldSourceHandle && (
              <CustomHandle
                className="w-2 h-2"
                id={`${model.id}-${field.name}`}
                position={Position.Right}
                style={{ background: "#555" }}
                type="source"
              />
            )}
          </td>
        </tr>
      );
    });
  }, [model]);

  return (
    <div key={id} className="border border-blue-700">
      {/* header */}
      <div className="relative px-1 text-white bg-blue-700">
        {/* target handle */}
        {hasTargetHandle && <CustomHandle id={`${model.id}-target`} position={Position.Left} type="target" />}
        {/* title */}
        {model.name}
      </div>
      {/* fields */}
      <div className="flex flex-col text-sm bg-white">
        <table cellPadding="3">
          <tbody>{fieldRows}</tbody>
        </table>
      </div>
    </div>
  );
};
