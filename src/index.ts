// Package entry point `.`: engine, ports, types.
// CONSTRAINT: no disk access here (ADR-AGENT-0002). The llm barrel carries the core kernel;
// tools/models adds ToolResult. Tools with I/O live behind `./tools`; the harness behind `./testing`.
export * from "./llm/index.js";
export * from "./tools/models/index.js";
