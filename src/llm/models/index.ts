// Modèles du framework LLM.
// Types purs : aucune dépendance runtime, aucun import de SDK (règle de placement, CLAUDE.md).

/** Rôle d'un message dans la conversation envoyée au modèle. */
export type Role = "system" | "user" | "assistant" | "tool";

/**
 * Un message de la conversation.
 * - `assistant` peut porter des `toolCalls` : le modèle demande des outils.
 * - `tool` répond à un appel précis, référencé par `toolCallId`.
 */
export type Message = {
  role: Role;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
};

/** Le modèle demande l'exécution d'un outil. `arguments` est déjà parsé en objet. */
export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

/**
 * Résultat d'un outil, réinjecté dans la conversation.
 * Un outil qui échoue renvoie un `ToolResult` avec `isError: true` — il ne LÈVE pas,
 * pour ne pas faire tomber la boucle (règle de sûreté, CLAUDE.md).
 */
export type ToolResult = {
  toolCallId: string;
  content: string;
  isError: boolean;
};

/** Comptage de jetons d'un appel. Absent (et non zéro) quand le provider ne le fournit pas. */
export type Usage = {
  tokensIn: number;
  tokensOut: number;
};

/**
 * Réponse du modèle à un appel.
 * `toolCalls` vide EST le signal d'arrêt de la boucle (ADR-AGENT-0003).
 * `usage` porte le coût ; rempli dès qu'un provider le fournit (ADR-AGENT-0007).
 */
export type LLMResponse = {
  content: string;
  toolCalls: ToolCall[];
  usage?: Usage;
};

/** Codes d'erreur remontés par un provider. Union fermée : une clé chaîne doit être typée. */
export type LLMErrorCode = "MISSING_API_KEY" | "API_ERROR" | "UNKNOWN_PROVIDER";

/**
 * Erreur de provider. Contrairement à un échec d'outil, elle REMONTE (CLAUDE.md).
 * Le `code` permet de distinguer les cas sans parser le message.
 */
export class LLMError extends Error {
  readonly code: LLMErrorCode;

  constructor(code: LLMErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LLMError";
    this.code = code;
  }
}
