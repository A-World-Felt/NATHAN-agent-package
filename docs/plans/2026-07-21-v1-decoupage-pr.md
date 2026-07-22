# Découpage en PR — V1

> **Date** : 2026-07-21
> **Portée** : V1 du package (voir `ROADMAP.md`)
> **Principe** : chaque PR ne dépend que des précédentes, et **chaque PR se vérifie**.

---

## Vue d'ensemble

| PR | Contenu | Critère de fin |
|---|---|---|
| **1** | packaging + `models/` + **arborescence complète** + schéma | `npm run build` produit `dist/` ; `npm install` réussit depuis un repo test |
| **2** | `ILLMProvider` + `OllamaLLMProvider` + `FakeLLMProvider` | test déterministe sur le faux ; un appel réel à Ollama |
| **3** | `IContextProvider` + `ITokenCounter` + `SlidingWindowContext` | troncature vérifiée, `observe()` no-op |
| **4** | `AgenticLLM` + `step()` + `ToolDispatcher` | boucle testée **sur le faux** : dispatch, `maxIterations`, `stopReason` |
| **5** | simulateur + `defineScenario` + `runScenario` | un scénario de navigation bout en bout |
| **6** | `runMatrix` + métriques + `toJSON`/`toCSV` | une matrice 2 modèles × 2 mémoires × 5 exécutions |

Puis : intégration dans le repo IDE, et retour ici quand un mur apparaît.

---

## PR1 — Le package existe et se construit

**Ce n'est pas une PR de fichiers vides.** Une arborescence sans contenu ne se vérifie pas : rien ne tourne, rien ne se teste, la revue n'a pas d'objet. Et la structure n'est qu'une hypothèse — on découvrirait en PR2 que la forme est fausse et la moitié serait déplacée.

> **Révision 2026-07-21.** Le périmètre a été élargi : PR1 pose aussi **le squelette complet** de l'arborescence (tous les dossiers, marqués `.gitkeep`, cartographiés dans `ROADMAP.md`). Le raisonnement ci-dessus tient toujours pour le **code** — aucun `index.ts` stub, aucune classe vide. Ce qu'on ajoute, ce sont des **dossiers**, pas des fichiers de code vides : la structure est désormais figée (validée de bout en bout contre la page 5 du schéma et les 4 bandes), donc le risque de déplacement en PR2 est faible ; et le propriétaire veut naviguer l'architecture en dossiers dès le départ. La vérification comportementale (build + install) reste portée par les `models/` et le packaging, comme ci-dessous.

Le vrai jalon est **la chaîne de distribution**, avec le minimum de contenu réel :

- `package.json` — les trois branches d'`exports` (`ADR-AGENT-0002`), `type: module`, `files: ["dist"]`
- `tsconfig.json` + `tsconfig.build.json`
- `.gitignore`, `.env.example`
- `src/llm/models/` — `Message`, `ToolCall`, `ToolResult`, `LLMResponse`, `LLMError`
- `src/tools/models/` — `ToolSchema`
- `src/index.ts`
- **le squelette complet de l'arborescence** (tous les dossiers, `.gitkeep`), cartographié dans `ROADMAP.md`
- le schéma mis à jour

Les types **sont** le contrat, ils sont purs, et `tsc` les vérifie.

**Vérification** : `npm run build` produit `dist/index.js` **et** `dist/index.d.ts` ; `npm pack` puis installation dans un repo jetable, avec un import qui compile.

> Piège ESM + `NodeNext` : les imports relatifs portent l'extension du fichier **émis**, donc `.js` même dans un `.ts`. `import type { Message } from "./models/index.js"`.

---

## PR2 — Le port LLM et ses deux premières implémentations

- `llm/interfaces/ILLMProvider.ts`
- `llm/providers/ollama/` — adaptateur réel
- `testing/fake-llm-provider.ts` — réponses scriptées
- `llm/providers/index.ts` — `PROVIDERS: Record<ProviderID, () => ILLMProvider>`, fermé et typé

**Le faux provider appartient à cette PR, pas au harnais.** C'est une deuxième implémentation du même port, écrite en même temps que lui. Deux raisons :

1. **La PR4 en dépend.** Tester la boucle contre Ollama seul reviendrait à tester *le modèle* au lieu de *notre code* — impossible de distinguer un bug de dispatch d'un modèle qui a mal répondu.
2. **C'est la vérification de l'interface.** Si le faux est pénible à écrire, le port est mauvais, et on l'apprend tout de suite.

`LLMResponse.usage` est rempli **dès maintenant** par l'adaptateur Ollama. Le rétro-ajouter dans chaque adaptateur plus tard coûte cher (`ADR-AGENT-0007`).

> **À vérifier contre le vrai endpoint** avant de coder : les noms exacts des champs de comptage renvoyés par Ollama. Ne pas les reprendre de mémoire (règle anti-hallucination n°2).

**Vérification** : suite déterministe sur le faux ; un appel réel à Ollama, lancé à la main, dont la sortie est montrée dans la PR.

---

## PR3 — Contexte et comptage

- `context/interfaces/IContextProvider.ts` — `build()`, `observe()`
- `context/interfaces/ITokenCounter.ts`
- `context/providers/sliding-window/`
- `HeuristicTokenCounter` — caractères ÷ 4, documenté approximatif

`observe()` est un no-op ici. C'est délibéré : l'ajouter en V3 casserait une interface déjà publiée.

**Vérification** : un historique qui déborde est tronqué ; le plus récent est conservé ; `observe()` ne fait rien sans planter.

---

## PR4 — La boucle

- `agent/application/dtos/` — `AgentDeps`, `AgentInput`, `AgentResult`, `AgentState`
- `agent/application/use-cases/agentic-llm.ts` — **classe `AgenticLLM`** : `run()`, `step()`
- `agent/services/step.ts` — **fonction pure**, une itération
- `tools/application/use-cases/dispatch-tool.ts` — `ToolDispatcher`
- `agent/services/define-agent.ts`

```ts
const agent = new AgenticLLM({ llm, context, tools, maxIterations: 10 });
const r = await agent.run("amène-moi aux réglages");
```

La classe est l'API publique (`ADR-AGENT-0009`) ; `run()` enroule la fonction pure `step(state, deps)`, testable sans instancier quoi que ce soit.

Terminaison par absence d'appel d'outil (`ADR-AGENT-0003`). Un outil qui échoue renvoie un `ToolResult` porteur de l'erreur — il ne fait pas tomber la boucle.

**Sortie forcée par atterrissage, pas par coupure** (`ADR-AGENT-0011`) : budget atteint (itérations / durée / jetons) ou répétition détectée (même outil, mêmes arguments, ≥ 3 fois) → on injecte « conclus avec ce que tu as » et on rappelle le modèle **sans outils**, ce qui le force à rédiger.

**Vérification, entièrement sur le faux provider** :

- une réponse sans appel d'outil → `stopReason: "completed"` ;
- un aller-retour d'outil aboutit ;
- budget épuisé → **une réponse rédigée est retournée**, `stopReason: "budget"` — pas un résultat vide ;
- le dernier appel du scénario budget se fait bien **sans outils** (le faux provider permet de l'affirmer) ;
- trois appels identiques d'affilée → `stopReason: "stuck"` ;
- un outil qui lève est capturé.

`step()` se teste directement, hors classe.

---

## PR5 — Le simulateur

- `testing/fake-app.ts` — fabrique d'environnement à état partagé
- `testing/define-scenario.ts`, `testing/run-scenario.ts`

Rappel des trois règles (`ADR-AGENT-0006`) : `env` est une **fabrique** (état neuf à chaque exécution), les attentes sont des **prédicats** (pas d'ordre strict imposé), et le résultat conserve la trace.

**Aucune table de substitution à écrire** (`ADR-AGENT-0010`) : le harnais construit un `AgenticLLM` avec les outils du simulateur, exactement comme la production le construit avec les siens. Il teste donc le **vrai** `ToolDispatcher`.

**Vérification** : « amène-moi aux réglages » avec un faux provider scripté, et l'assertion porte sur l'**état du simulateur**, pas seulement sur la liste des appels.

---

## PR6 — La matrice et les métriques

- `metrics/` — `IMetricsCollector`, `MetricsCollector`, agrégation pure
- `llm/infrastructure/with-metrics.ts` — le décorateur
- `testing/run-matrix.ts` — produit cartésien des axes, `runs` répétitions, rapport

Portée par instance, jamais `start`/`stop` (`ADR-AGENT-0007`). Tarifs passés en argument. Dimensions séparées, pas de score composite.

**Vérification** : une matrice 2 × 2 × 5 sur le faux provider produit 20 exécutions, un taux par combinaison, et un CSV lisible. Les échecs conservent leur trace.

---

## Conventions transverses

- **Commits** : `type(scope): description` (`feat(llm): ajouter OllamaLLMProvider`). Pas les emojis cuisine de Marcel, spécifiques à leur projet.
- **Tests unitaires** : `node:test`, zéro dépendance.
- **Évals** : programme lancé à la main, jamais bloquant en CI.
- **Baril par couche**, avec `barrel-contract.test.ts` qui verrouille l'API publique — précieux pour un package : un export retiré par mégarde casse un test, pas un consommateur.
- **Jamais** de clé d'API en dur, jamais de `.env` commité.
