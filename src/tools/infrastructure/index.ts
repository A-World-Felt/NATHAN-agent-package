// The `./tools` subpath: the generic, disk-coupled tools the package provides (ADR-AGENT-0002).
// Empty for now rather than absent. The subpath is declared in the exports map, and a declared
// entry point that throws on import is worse than one that was never declared: a consumer reads
// the map, imports it, and gets ERR_MODULE_NOT_FOUND instead of an honest empty surface.
//
// The concrete tools (read-file, write-file, list-files) land here, behind this subpath and never
// in `.`, which must stay importable where there is no disk. The port and the dispatcher are the
// pure half and stay in `.`.
export {};
