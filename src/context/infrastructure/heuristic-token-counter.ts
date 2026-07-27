import type { Message } from "../../llm/models/index.js";
import type { TokenCounter } from "../interfaces/index.js";

/** Average characters per token, the V1 approximation (ADR-AGENT-0008). */
const CHARACTERS_PER_TOKEN = 4;

/**
 * Characters divided by four: the V1 baseline decided in ADR-AGENT-0008, zero dependency.
 *
 * Approximate by construction, and poorest on code and accented French, the two cases that
 * matter most to NATHAN. It also does **not** count the chat-template framing a provider adds
 * around each message: take that margin on `maxTokens`, at the caller. Providers report the
 * real `usage`, so this error is measurable rather than guessed, which is what will decide
 * when a real tokenizer becomes necessary.
 */
export class HeuristicTokenCounter implements TokenCounter {
  count(messages: Message[]): number {
    let characters = 0;
    for (const message of messages) {
      characters += billableCharacters(message);
    }
    return Math.ceil(characters / CHARACTERS_PER_TOKEN);
  }
}

/**
 * What one message actually puts on the wire. An assistant that calls a tool usually has an
 * empty `content` while sending a real tool-call payload, so that payload is counted too:
 * counting `content` alone would badly undercount a tool-heavy conversation.
 */
function billableCharacters(message: Message): number {
  const contentLength = message.content.length;
  if (message.role !== "assistant") return contentLength;
  if (message.toolCalls === undefined) return contentLength;
  const payload = JSON.stringify(message.toolCalls);
  return contentLength + payload.length;
}
