// The llm framework's test tooling: the scripted fake provider and the port conformance check.
// Shipped to consumers via the ./testing subpath only, never through the ./llm production barrel.
export { FakeLLMProvider } from "./fake-llm-provider.js";
export type { FakeConfig } from "./fake-llm-provider.js";
export { checkProviderContract } from "./provider-contract.js";
export type { ContractCheck, ContractReport } from "./provider-contract.js";
