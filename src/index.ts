// Point d'entrée `.` du package : moteur, ports, types.
// CONTRAINTE : aucun accès disque ici — ce baril doit rester importable partout (ADR-AGENT-0002).
// Les implémentations couplées au disque vivent derrière `./tools` ; le harnais derrière `./testing`.

export * from "./llm/models/index.js";
export * from "./tools/models/index.js";
