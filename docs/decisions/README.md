# Décisions d'architecture — nathan-agent-core

Registre des décisions de conception du package. Format imposé par la gouvernance du projet (`ADR-0007`, `NATHAN-console/docs/decisions/`) : statut, date, décideurs, contexte, options évaluées, décision, conséquences.

**Un ADR est immuable après acceptation.** Pour revenir sur une décision, écrire un nouvel ADR et marquer l'ancien « Remplacé par ADR-AGENT-XXXX ».

## Numérotation

Préfixe `ADR-AGENT-` volontaire. Les ADR au niveau projet (`ADR-0001` à `ADR-0007`) vivent dans `NATHAN-console/docs/decisions/` et sont référencés partout dans `PMC/CONTEXT-AGENT.md` ; une série locale non préfixée entrerait en collision avec eux.

Portée de cette série : le package `@a-world-felt/nathan-agent-core` uniquement.

## Registre

| # | Décision | Statut | Date |
|---|---|---|---|
| [ADR-AGENT-0001](ADR-AGENT-0001-architecture-hexagonale-use-cases-fonctions.md) | Architecture hexagonale | ✅ Accepté — complété par 0009 | 2026-07-21 |
| [ADR-AGENT-0002](ADR-AGENT-0002-trois-points-entree-outils-a-la-carte.md) | Trois points d'entrée, outils à la carte | ✅ Accepté | 2026-07-21 |
| [ADR-AGENT-0003](ADR-AGENT-0003-terminaison-boucle-machine-etats.md) | Terminaison par absence d'appel d'outil, machine à états suspendable | ✅ Accepté | 2026-07-21 |
| [ADR-AGENT-0004](ADR-AGENT-0004-isolation-politique-execution.md) | Isolation : politique et exécution, deux axes composables | ✅ Accepté | 2026-07-21 |
| [ADR-AGENT-0005](ADR-AGENT-0005-agents-typescript-versioning-git.md) | Agents déclarés en TypeScript, versioning par git | ✅ Accepté | 2026-07-21 |
| [ADR-AGENT-0006](ADR-AGENT-0006-harnais-simulateur-agnostique.md) | Harnais : simulateur à état, agnostique du lanceur | ✅ Accepté | 2026-07-21 |
| [ADR-AGENT-0007](ADR-AGENT-0007-metriques-decorateur-portee-instance.md) | Métriques par décorateur, portée par instance | ✅ Accepté | 2026-07-21 |
| [ADR-AGENT-0008](ADR-AGENT-0008-comptage-jetons-derriere-un-port.md) | Comptage de jetons derrière un port | ✅ Accepté | 2026-07-21 |
| [ADR-AGENT-0009](ADR-AGENT-0009-classes-pour-api-publique.md) | Classes pour l'API publique, fonctions pures à l'intérieur | ✅ Accepté | 2026-07-21 |
| [ADR-AGENT-0010](ADR-AGENT-0010-pas-de-table-de-substitution.md) | Pas de table de substitution d'outils | ✅ Accepté | 2026-07-21 |
| [ADR-AGENT-0011](ADR-AGENT-0011-budget-et-atterrissage-gracieux.md) | Budget et atterrissage gracieux plutôt que coupure sèche | ✅ Accepté | 2026-07-21 |

## Décisions à venir

| Sujet | Quand |
|---|---|
| Provider de la V2 (qualité d'appel d'outils / coût au jeton / latence) | avant la PR du 2ᵉ provider |
| Implémentation réelle de `ITokenCounter` (famille de modèles) | quand l'heuristique montrera ses limites |
| Exécution en container | pas avant qu'un consommateur expose un shell |
| Approbation utilisateur avant écriture | quand le repo IDE en aura besoin |

## Sources

**La source qui fait autorité est le diagramme d'architecture de l'équipe** — `docs/schema/DiagrammeClasseAI.drawio`, et sa version à jour `DiagrammeClasse-agent-core.drawio`. Ses noms de classes et ses quatre bandes sont le vocabulaire de référence.

Le consommateur réel est **l'IDE accessible de NATHAN**, construit dans `PMC/`. C'est lui qui arbitrera à l'usage.

Les repos voisins ne sont **ni des références ni des autorités** — l'équipe ne les connaît pas, et aucun n'est le consommateur du package. Ils ont servi de matière d'analyse, citée comme preuve datée :

| Repo | Ce qui en a été tiré | Ce qu'il ne peut pas trancher |
|---|---|---|
| `C:\Marcel` | le champ `feature: string` qui a dérivé en production → « une clé chaîne doit être typée » | la conception d'API — il n'en expose aucune (`ADR-AGENT-0009`) |
| `C:\Meastro` | contre-exemples d'exécution d'outils et de permissions (`ADR-AGENT-0004`) | rien d'autre : « en fait trop », c'est la raison de refaire |
| `NATHAN-jira-package` | conventions de packaging (scope, registre, ESM, build `tsc`) | la structure interne — il est plat, sans variantes à absorber |
