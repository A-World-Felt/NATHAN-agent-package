// Modèles du framework Outils. Types purs, aucune dépendance.

/** Types JSON Schema utilisés pour décrire un paramètre d'outil. */
export type JSONSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array";

/**
 * Un paramètre d'outil, sous-ensemble de JSON Schema.
 * On ne modélise pas JSON Schema en entier — seulement ce qu'un appel d'outil utilise
 * (pas d'overhead, CLAUDE.md). À étendre si un besoin réel apparaît.
 */
export type JSONSchemaProperty = {
  type: JSONSchemaType;
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty; // pour type: "array"
  properties?: Record<string, JSONSchemaProperty>; // pour type: "object"
  required?: string[];
};

/**
 * Schéma des paramètres d'un outil, tel que présenté au modèle.
 * Le modèle ne peut pas appeler un outil dont il ignore les paramètres :
 * ce schéma est obligatoire (spec §10, ADR-0006 projet).
 */
export type ToolSchema = {
  type: "object";
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
};
