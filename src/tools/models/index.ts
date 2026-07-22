// Tools framework models. Pure types, no dependency.

/** JSON Schema types used to describe a tool parameter. */
export type JSONSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array";

/**
 * A tool parameter, a subset of JSON Schema.
 * We do not model the whole of JSON Schema, only what a tool call uses
 * (no overhead, CLAUDE.md). Extend it if a real need arises.
 */
export type JSONSchemaProperty = {
  type: JSONSchemaType;
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty; // for type: "array"
  properties?: Record<string, JSONSchemaProperty>; // for type: "object"
  required?: string[];
};

/**
 * Schema of a tool's parameters, as presented to the model.
 * The model cannot call a tool whose parameters it does not know:
 * this schema is mandatory (spec §10, project ADR-0006).
 */
export type ToolSchema = {
  type: "object";
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
};
