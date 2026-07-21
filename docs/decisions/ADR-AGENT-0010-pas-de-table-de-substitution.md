# ADR-AGENT-0010 — Pas de table de substitution d'outils

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`

## Contexte

Le harnais doit pouvoir présenter à l'agent des outils simulés au lieu des outils réels, **sans que l'agent puisse faire la différence** (`ADR-AGENT-0006`).

Question posée : *« il y aurait soit une abstraction avant `ToolDispatcher`, soit après, car la puissance de notre architecture est que l'agent ne sait pas l'implémentation des tools. »*

L'intuition venait de Meastro, qui possède exactement ce mécanisme : `_toolMapping` (`ToolDispatcherBlockExecutor.cs:62-73`), une table qui redirige les identifiants d'outils vers des blocs de capture. Le dispatcher substitue de façon transparente et conserve l'identifiant d'origine pour les assertions.

## Pourquoi Meastro en a besoin, et pas nous

**Chez Meastro, un outil est un manifeste sur disque résolu par identifiant à l'exécution** (`*.tool.block.json`, découverts par `IBlockDiscoveryService`, résolus via `registry.Get(blockType)`). Il n'existe aucun moyen d'injecter une autre implémentation : le dispatcher va chercher l'outil par son nom. La seule façon de substituer est donc **une table de redirection au milieu**.

**Chez nous, `ITool` est une interface et les outils sont passés en objets.** La substitution est déjà possible — et elle a lieu à la construction :

```ts
new AgenticLLM({ tools: [navigate, click] })   // production
new AgenticLLM({ tools: app.tools })            // simulateur
```

**L'abstraction, c'est l'interface elle-même.** Il n'y a rien à ajouter ni avant ni après le `ToolDispatcher`.

## Options évaluées

**A — Table de substitution dans le `ToolDispatcher`.**
Calquée sur Meastro. Redirige `name → implémentation de remplacement` à l'exécution.

**B — Un second `ToolDispatcher` dédié au harnais.**
Deux chemins de dispatch à maintenir, qui divergeront. Et le harnais ne testerait plus le dispatcher réel.

**C — Rien. La substitution se fait à la construction.**

## Décision

**Option C.**

Aucune table, aucune redirection, aucun registre par nom. Le harnais construit un `AgenticLLM` avec les outils du simulateur, exactement comme la production le construit avec les siens.

## Conséquences

**Positives**

- **Zéro code.** La capacité recherchée est un effet de bord de l'injection de dépendances, pas une fonctionnalité à écrire.
- **Le harnais teste le vrai dispatcher**, pas une variante de test. Un seul chemin de code entre le développement et la production.
- **Aucune surface d'attaque ajoutée.** C'est le piège n°6 relevé chez Meastro : `_toolMapping` y est une simple variable de session, propagée entre sessions (`BlockRefHandler.cs:191`). Si un agent peut écrire des variables de session, il peut recâbler ses propres outils. Une table de redirection à l'exécution réimplémente l'injection de dépendances — en moins sûr.
- Cohérent avec `ADR-AGENT-0005` : pas de recherche par nom, pas de clé `string` non typée.

**Négatives**

- Le consommateur doit **câbler explicitement** ses outils à chaque construction. C'est le prix de l'absence de magie, et c'est la même philosophie que « les outils sont à la carte » (`ADR-AGENT-0002`).
- On perd la possibilité de substituer un outil *en cours d'exécution*. Aucun besoin identifié ; le jour où il s'en présente un, il faudra un ADR qui le remplace.

**Ce qui reste vrai de l'idée d'origine**

L'objectif — *l'agent ne sait pas quelle implémentation se cache derrière un outil* — est intégralement atteint. C'est le contrat `ITool` qui le garantit, pas un mécanisme de redirection. Voir la page 2 du diagramme `docs/schema/Architecture-agent-core.drawio`, qui en fait sa démonstration visuelle.
