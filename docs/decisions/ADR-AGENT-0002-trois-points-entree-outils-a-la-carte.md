# ADR-AGENT-0002 — Trois points d'entrée, outils à la carte

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`

## Contexte

Le package livre trois natures de code qui n'ont pas les mêmes contraintes :

| Nature | Contrainte |
|---|---|
| Moteur (ports, boucle, `defineAgent`) | doit être importable partout, y compris là où il n'y a pas de disque |
| Outils fichiers génériques | couplés à `fs` |
| Harnais de test | ne doit **jamais** partir dans un bundle de production |

Décision explicite de l'équipe : « les outils peuvent être ajoutés du repo consommateur. Le package peut en fournir des génériques mais ce ne sont pas des outils toujours là. »

Si tout sort d'un baril unique, importer le package pour lire un type traîne `fs` et le code de test derrière lui.

Précédent maison : `NATHAN-jira-package` n'a qu'une branche d'`exports`. Marcel, lui, sépare déjà `llm/index.ts` de `llm/server.ts` avec une garde `import "server-only"` — le réflexe existe.

## Options évaluées

**A — Un seul baril.**
Le plus simple à écrire. Traîne `fs` et le harnais partout ; rend impossible toute exécution hors Node.

**B — Trois sous-chemins dans la carte `exports`.**
`.`, `./tools`, `./testing`. Une seule unité de publication, trois surfaces.

**C — Trois packages npm séparés.**
Séparation maximale. Trois versions à synchroniser, trois publications, pour un projet à un seul mainteneur. Overhead disproportionné.

## Décision

**Option B.**

```json
"exports": {
  ".":         { "types": "./dist/index.d.ts",                      "default": "./dist/index.js" },
  "./tools":   { "types": "./dist/tools/infrastructure/index.d.ts", "default": "./dist/tools/infrastructure/index.js" },
  "./testing": { "types": "./dist/testing/index.d.ts",              "default": "./dist/testing/index.js" }
}
```

- `.` — moteur, ports, `defineAgent`, types. **Aucun accès disque.**
- `./tools` — outils génériques fournis. Opt-in.
- `./testing` — simulateur, faux provider, scénarios.

`ITool` et le dispatch restent dans `.` : tout le monde en a besoin. Seules les **implémentations** concrètes d'outils partent dans `./tools`.

Un agent reçoit exactement les outils qu'on lui passe. **Rien d'implicite.**

## Conséquences

**Positives**

- Le point d'entrée principal reste léger et portable.
- Le harnais ne peut pas se retrouver en production par inadvertance.
- Le consommateur choisit ses outils comme il choisit son provider — même philosophie sur les deux axes.

**Négatives**

- Carte `exports` à maintenir : un nouveau sous-chemin est un changement d'API publique.
- Écart avec `NATHAN-jira-package`, dont la carte n'a qu'une branche. Documenté dans `CLAUDE.md`.
- Les tests de contrat de baril doivent couvrir les trois branches, pas une.

**Risque connu**

Les outils fichiers couplent `./tools` à Node. L'IDE NATHAN étant Electron ou Tauri, Node est présent. Si un consommateur devait un jour tourner dans un navigateur, `./tools` casserait à l'import — mais `.` resterait saine. C'est précisément ce que cette séparation protège.
