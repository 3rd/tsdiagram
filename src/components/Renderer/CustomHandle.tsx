import { useEffect } from "react";
import { Handle, HandleProps, useUpdateNodeInternals } from "reactflow";

export const CustomHandle = (props: HandleProps & Omit<React.HTMLAttributes<HTMLDivElement>, "id">) => {
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(props.id!);
  }, [props.id, updateNodeInternals]);

  return <Handle {...props} />;
};
