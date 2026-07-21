# Claude Code Guidelines for nathan-agent-core

`@a-world-felt/nathan-agent-core` — la couche agentique LLM de NATHAN.

Le package fournit **trois choses** : le moteur (providers LLM, outils, boucle, mémoire), les définitions d'agents (prompt + outils), et un harnais de test d'agents. Le repo consommateur choisit son provider et apporte ses propres outils.

Contexte projet : NATHAN Console v2.0, environnement de programmation accessible à assistance vocale par IA (ADR-0006, Flux E). Contexte complet : `PMC/CONTEXT-AGENT.md`.

## Où trouver le pourquoi

| Document | Contenu |
|---|---|
| `docs/decisions/` | **les ADR** — contexte, options évaluées, décision, conséquences. À lire avant de remettre en cause un choix. |
| `docs/specs/2026-07-14-agent-core-design.md` | la conception V1 : contrats, boucle, harnais, écarts vis-à-vis du diagramme. **Non versionnée** (`.gitignore`) — document de travail local. Ce qui doit survivre est dans les ADR. |
| `docs/plans/2026-07-21-v1-decoupage-pr.md` | le découpage en 6 PR, avec le critère de vérification de chacune |
| `ROADMAP.md` | les quatre versions et ce qui est repoussé sans date |
| `docs/schema/Architecture-agent-core.drawio` | **5 pages, à lire dans l'ordre** : vue de l'agent → substitution → une itération → harnais → architecture complète. Voir `docs/schema/README.md`. |

**Contrainte permanente, formulée par l'équipe : pas d'overhead, ça doit rester maintenable.** C'est le critère qui a écarté le cadre de permissions générique, le tokenizer embarqué et le registre runtime.

## Communication Style

- Répondre **en français**.
- Direct et concis — pas de remplissage, pas de hedging.
- Pas de résumé final : le diff se lit.

## Ce que ce package n'est pas

- **Pas un wrapper d'un SDK existant.** Le moteur est écrit ici.
- **Pas une extraction du `src/llm/` d'un autre repo.** Le contrat de Marcel (`C:\Marcel`) est `generate(prompt, context, config) → { content }` : ni appel d'outils, ni streaming, et son `UsageContext` est couplé à sa facturation par palier.

### Sur les repos voisins

`C:\Marcel` et `C:\Meastro` ne sont **ni des références, ni des autorités**. L'équipe ne les connaît pas, et aucun des deux n'est le consommateur de ce package.

- **Marcel** — app Next.js privée, jamais publiée, sans boucle agentique ni appel d'outils. N'expose aucune API publique : ne peut donc rien dire sur la conception d'API.
- **Meastro** — backend C#, analysé pour ses **contre-exemples** d'exécution d'outils (`ADR-AGENT-0004`).

Ce qui en est retenu tient en deux observations datées, citées comme preuves et non comme conventions : le champ `feature: string` de Marcel qui a dérivé en production, et les pièges de permissions de Meastro.

**Le consommateur réel est l'IDE accessible de NATHAN, construit dans `PMC/`.** C'est lui qui arbitre.

## Architecture

Hexagonale — ports et adaptateurs, séparation stricte.

**Ce n'est pas une préférence de style : le domaine l'impose.** Presque tout ce que le package expose existe en plusieurs implémentations interchangeables derrière un contrat stable — six ports, une quinzaine d'implémentations. Un package dont la promesse est « le repo consommateur choisit son provider et apporte ses outils » ne peut pas être structuré autrement sans trahir sa promesse.

Le diagramme d'architecture de l'équipe l'était déjà : ses quatre bandes — `Applicatif`, `Interface`, `Implémentation Locale`, `Implémentation Externe` — sont exactement cette séparation. Justification complète : `ADR-AGENT-0001`.

### Trois points d'entrée publics

| Sous-chemin | Contenu | Contrainte |
|---|---|---|
| `.` | moteur, ports, `defineAgent` | **aucun accès disque** — doit rester importable partout |
| `./tools` | outils génériques fournis | opt-in, couplé à `fs` |
| `./testing` | harnais de test | ne doit jamais partir en production |

Les outils sont **à la carte**. Un agent reçoit exactement les outils qu'on lui passe, rien d'implicite. Si les outils fichiers étaient dans le baril principal, importer le package traînerait `fs` derrière lui.

### Arborescence

```
src/
  llm/                          # framework peer — agnostique du provider
    models/index.ts               Message, LLMResponse, ToolCall, ToolResult, LLMError
    interfaces/ILLMProvider.ts
    services/response-parser.ts   pur
    providers/
      ollama/ollama-adapter.ts    OllamaLLMProvider — CLASSE (I/O réel)
      index.ts                    PROVIDERS: Record<ProviderID, () => ILLMProvider>
    index.ts

  context/                      # framework peer — 2 providers, 1 contrat
    interfaces/IContextProvider.ts
    interfaces/ITokenCounter.ts
    providers/
      sliding-window/             V1
      memory/                     V3 — se branche ici sans toucher à l'agent
    infrastructure/heuristic-token-counter.ts
    index.ts

  tools/
    models/index.ts               ToolCall, ToolResult, ToolSchema
    interfaces/ITool.ts
    application/use-cases/dispatch-tool.ts    chaîne record → [authorize] → execute
    infrastructure/               read-file.ts, write-file.ts, list-files.ts → branche ./tools
    index.ts

  metrics/                      # framework peer
    models/index.ts               UsageRecord, MetricsTotal, RateTable
    interfaces/IMetricsCollector.ts
    services/aggregate.ts         pur
    infrastructure/collector.ts
    index.ts

  agent/                        # l'app
    models/AgentDefinition.ts
    services/define-agent.ts      pur
    services/step.ts              pur — une itération de la boucle
    application/
      dtos/index.ts               AgentDeps, AgentInput, AgentResult, AgentState
      use-cases/agentic-llm.ts    AgenticLLM — CLASSE (API publique)
      use-cases/voice-agentic-llm.ts   VoiceAgenticLLM — V4
    index.ts

  testing/                      # branche ./testing
    fake-llm-provider.ts          livré dès la PR2 — 2e implémentation du port
    fake-app.ts                   simulateur à état partagé (≠ mock)
    define-scenario.ts
    run-scenario.ts
    run-matrix.ts
    index.ts
```

`llm/infrastructure/with-metrics.ts` — décorateur qui implémente `ILLMProvider` et relaie vers un `IMetricsCollector`. Il vit là où il enveloppe.

`context/` est un **framework à part entière**, pas un sous-dossier de `agent/` : règle de Marcel — « MANY providers serve ONE contract → nested per-vendor ». Fenêtre glissante et mémoire sont deux providers du même port.

### Couches internes par framework

Chaque framework suit le même patron :

```
<framework>/
  models/            entités, types, enums — aucune dépendance runtime, aucun import SDK
  interfaces/        ports : I*.ts — contrats seulement
  services/          fonctions PURES — n'importe JAMAIS interfaces/
  application/
    dtos/            Deps, Input, Result, Options
    use-cases/       orchestration UNIQUEMENT
  providers/<vendor>/  adaptateurs concrets par fournisseur
  infrastructure/    autres adaptateurs concrets (I/O réel)
```

### Règle de placement (arbre de décision par fichier)

1. Type/interface décrivant une donnée → `models/`
2. Interface décrivant un port (`I<X>`) → `interfaces/`
3. Fonction pure (ni disque, ni HTTP, ni SDK) → `services/`
4. Fonction qui prend un port et orchestre → `application/use-cases/`
5. Classe implémentant un port via de l'I/O réel → `providers/<vendor>/` ou `infrastructure/`

### Classes vs fonctions — la règle qui compte

| Nature | Forme | Exemples |
|---|---|---|
| **API publique** avec état et plusieurs opérations | **classe** | `AgenticLLM`, `VoiceAgenticLLM` |
| Adaptateur implémentant un port via de l'I/O | classe | `OllamaLLMProvider`, `SlidingWindowContext`, les outils |
| Fonction pure d'orchestration ou de calcul | fonction | `step`, `dispatchTool`, `defineAgent`, agrégation |

```ts
// API publique — ce que le repo consommateur manipule
const agent = new AgenticLLM({ llm, context, tools, maxIterations: 10 });
const result = await agent.run("amène-moi aux réglages");
```

`AgenticLLM.run()` enroule une **fonction pure** `step(state, deps)` — testable isolément, sans instancier la classe. La classe est l'API, les fonctions sont la mécanique.

> Un package publié a une contrainte qu'une application n'a pas : **une surface d'API découvrable**. `agent.` déclenche l'autocomplétion ; une fonction retournée par une fabrique n'expose rien. Justification : `ADR-AGENT-0009`.

### Pas de registre runtime

`defineAgent()` est une fonction pure qui retourne un objet typé. Les agents sont des `const` exportés, importés statiquement. **Aucune recherche par nom, aucune clé `string` non typée.**

Le mode de panne à éviter, observé en production dans `C:\Marcel` (`src/llm/models/index.ts:62`) :

```ts
feature: string;  // 'generation' | 'replace' | 'chat' | 'coverage-check' | etc.
```

L'union réelle vit dans le commentaire. Résultat : la liste a dérivé en quelques mois, `coverage-check` n'existe pas en production comme `feature`.

> **Si une clé est une chaîne, elle doit être typée.** Forme correcte : `PROVIDERS: Record<ProviderID, () => ILLMProvider>` — union fermée, typée, pilotée par variable d'environnement.

## Conventions de code

- TypeScript strict — pas de `any` sans commentaire justificatif.
- Fichiers en `kebab-case.ts` ; ports en `IPascalCase.ts`.
- Baril `index.ts` par couche ; les consommateurs importent depuis le baril, jamais d'un fichier individuel.
- **Tests de contrat de baril** (`barrel-contract.test.ts`) : ils verrouillent l'API publique. Précieux pour un package — un export retiré par mégarde casse un test, pas un consommateur.
- Code simple et lisible — pas de génériques sophistiqués pour un cas unique.
- Commenter la logique non évidente (prompts, transformations).

## Conventions de packaging

Reprises de `NATHAN-jira-package` (`@a-world-felt/nathan-jira-core`), seul précédent maison. Marcel ne peut pas servir ici : il est `private: true` et n'est jamais publié.

| Décision | Valeur |
|---|---|
| Scope + registre | `@a-world-felt/…` sur `npm.pkg.github.com`, `access: restricted` |
| Format | ESM pur — `"type": "module"`, `module: NodeNext` |
| Build | `tsc` nu via `tsconfig.build.json` → `dist/`. **Pas de bundler.** |
| Publication | `files: ["dist"]`, `prepare: npm run build` |
| Tests | `node:test` — zéro dépendance |
| Config | `.env.example` ; `dotenv` en **devDependency uniquement** |

**Trois écarts vis-à-vis de jira**, assumés :

1. Sa carte `exports` n'a qu'une branche. Il en faut trois ici (voir plus haut).
2. Jira fait `import 'dotenv/config'` en tête de `src/config.ts`. Pour une **librairie publiée**, c'est un effet de bord à l'import : lire un `.env` dans le répertoire courant du consommateur et injecter dans son `process.env` n'est pas le rôle d'une librairie. **L'application charge son `.env`, la librairie lit `process.env`.**
3. Jira est resté en vitest 1.x. Ici `node:test` suffit et supprime la dépendance.

> Piège ESM + `NodeNext` : les imports relatifs portent l'extension du fichier **émis**, donc `.js` même depuis un `.ts` — `import type { Message } from "./models/index.js"`. Précédent : `NATHAN-jira-package/src/config.ts:2`.

## Conventions de test

Deux suites distinctes. Les mélanger produit une suite instable.

| | Faux LLM scripté + outils fictifs | **Vrai** LLM + outils fictifs |
|---|---|---|
| Ce qu'on teste | **notre boucle** : dispatch, `maxIterations`, terminaison | **le modèle** : sait-il choisir le bon outil |
| Nature | déterministe, instantané, gratuit | non déterministe, réseau, payant |
| Outil | `node:test` — à chaque commit | **pilote maison**, à la main, jamais bloquant |

La colonne de droite est une **évaluation**, pas un test unitaire : elle ne pense pas en réussi/échoué mais en **taux**, sur une **matrice**, et produit un **rapport**. Un lanceur de tests modélise mal ça — d'où un pilote à nous, qui n'est qu'une boucle et un tableau.

Le harnais est **agnostique du lanceur** : il retourne un résultat, le consommateur affirme avec ce qu'il veut. Le coupler à un lanceur en ferait une dépendance de pair imposée aux repos consommateurs.

Le package **livre le faux provider et le simulateur**. Sans ça, chaque consommateur les réécrit, mal.

**Simulateur ≠ mock.** Un mock renvoie une valeur figée ; un simulateur est un ensemble d'outils partageant un état mutable cohérent — `navigate("réglages")` puis `getCurrentPage()` doit renvoyer `"réglages"`. Trois règles : `env` est une **fabrique** (état neuf par exécution), les attentes sont des **prédicats** (pas d'ordre strict), le rapport **conserve les échecs**.

**Une exécution ne mesure rien.** N répétitions par combinaison, agrégées en taux — sinon un succès unique ne distingue pas un modèle à 95 % d'un modèle à 60 %.

## Conventions de commit

Conventional commits (`PMC/CONTEXT-AGENT.md` §11.4) : `type(scope): description`.

```
feat(llm): ajouter OllamaLLMProvider
fix(agent): stopReason incorrect quand maxIterations atteint
```

> Ne **pas** reprendre les emojis cuisine de `Marcel/PR_CONVENTIONS.md` : ils sont spécifiques à Marcel.

## Règles de sûreté

- **JAMAIS** de clé d'API en dur — variables d'environnement uniquement.
- **JAMAIS** de `.env` commité.
- Un outil qui échoue **ne fait pas tomber la boucle** : il renvoie un `ToolResult` porteur de l'erreur, qui repart vers le modèle. Une exception qui traverse la boucle rend l'agent fragile.
- Les erreurs de provider, elles, remontent : `LLMError` avec code.

## Règles anti-hallucination

1. Ne jamais dire « les tests passent » sans les avoir lancés et montré la sortie.
2. Ne jamais deviner une réponse d'API — tester contre le vrai point de terminaison ou simuler explicitement.
3. Si un nom, un chiffre ou une date manque, écrire `[À COMPLÉTER]` plutôt qu'inventer.
