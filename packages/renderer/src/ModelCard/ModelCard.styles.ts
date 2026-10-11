export const MODEL_CARD_CLASSES = {
  root: "max-w-md rounded-lg border shadow-(--shadow-card)",
  field: {
    root: "text-body [&+tr>td]:border-t [&+tr>td]:border-divider",
    keyCell: "py-1 pr-4 pl-2 text-text align-top",
    inheritedName: "text-text-faint",
    typeCell: "relative py-1 pr-2 break-words",
    defaultTypeColor: "text-text-faint",
    modelTypeColor: "text-accent",
    primitiveTypeColor: "text-text-muted",
    literalTypeColor: "text-code-literal",
  },
} as const;
