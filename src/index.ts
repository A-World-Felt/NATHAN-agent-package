// Package entry point `.`: engine, ports, types.
// CONSTRAINT: no disk access here (ADR-AGENT-0002). The llm barrel carries the core kernel;
// tools/models adds ToolResult. Tools with I/O live behind `./tools`; the harness behind `./testing`.
// context/ ships here rather than behind its own subpath: no standalone consumer yet (ADR-AGENT-0012).
export * from "./llm/index.js";
export * from "./context/index.js";
export * from "./tools/models/index.js";
