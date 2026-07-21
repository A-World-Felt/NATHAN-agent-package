# ADR-AGENT-0004 — Isolation : politique et exécution, deux axes composables

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`

## Contexte

L'intention initiale était de reprendre le modèle de Meastro (`C:\Meastro`), compris comme : *« cette instance tool est soit un container isolé, soit l'isolement est créé par une logique qui vérifie les permissions et vient faire l'isolation en vérifiant les commandes. »*

**L'analyse du code de Meastro contredit cette lecture.** Les deux briques existent, mais elles ne sont pas reliées :

- `IContainerRuntime` est réel — `DockerContainerRuntime` lance le binaire `docker`. Mais ses seuls consommateurs sont un contrôleur REST et un service de cycle de vie d'environnement projet. **Aucun exécuteur de bloc, aucun point du chemin de dispatch d'outil ne le touche.**
- L'outil shell réel (`ShellBlockExecutor.cs:105`) fait un `Process.Start` de `cmd.exe /c` ou `/bin/bash -c` **sur l'hôte**, sans container ni jail.
- Le mot « container » dans le code (`ContainerSession`, `ContainerIsolationE2ETests`) désigne **une portée de permissions** dans un arbre de sessions, pas un container OS.
- `WorkspaceIsolation` (réseaux Docker, limites CPU/RAM) est sérialisé et stocké — **rien ne l'applique**.

Il n'y a qu'**un seul** mécanisme d'isolation d'outils chez Meastro : la porte de permissions. Et cette porte **ne valide aucun argument** : une fois `shell-execute` autorisé, le modèle passe n'importe quelle chaîne de commande.

> Autoriser un outil ≠ le contraindre. Des permissions grossières au niveau de l'outil, sur un outil `bash`, ce sont approximativement zéro permission.

Le modèle « isolation par vérification des commandes » n'existe donc nulle part. Il serait à inventer, pas à copier.

## Le raisonnement de fond

« Container » et « permissions » ne sont pas deux modes d'une même chose. Ce sont **deux dimensions indépendantes** :

| Axe | Question | Réponses |
|---|---|---|
| **Politique** | l'appel est-il autorisé ? | tout permis · allowlist · demander |
| **Exécution** | où le code tourne-t-il ? | en process · sous-process · container · simulateur |

Les traiter comme deux implémentations sœurs d'une même interface interdit de les **combiner** — or c'est ce qu'on veut. Un container sans politique laisse l'agent tout détruire à l'intérieur, volumes montés compris. Une politique sans container suffit dans beaucoup de cas.

Meastro démontre le coût de la confusion par l'exemple négatif : un vocabulaire qui ment sur ce que fait le code.

## Options évaluées

**A — Deux implémentations sœurs d'un `IToolExecutor`.**
La lecture initiale de Meastro. Empêche de composer ; reproduit l'ambiguïté de vocabulaire.

**B — Chaîne de décorateurs pour la politique, choix exclusif pour l'exécution.**
`dispatch = record(authorize(execute))`. La politique et l'observation sont des étages composables ; seule l'exécution est un choix.

**C — Rien du tout en V1 : contraintes portées par l'outil.**
Un `WriteFile` construit avec un répertoire racine, qui refuse d'en sortir. Dix lignes, aucun cadre.

## Décision

**Option B comme forme cible, option C pour la V1.**

La V1 ne construit **aucune couche de permissions**. Les contraintes sont portées par les outils eux-mêmes. Justification : contrainte explicite de l'équipe — « il ne faut pas faire de overhead, ça doit rester maintenable », et « Meastro en fait trop, c'est pour ça qu'on le refait ».

Quand une politique deviendra nécessaire, elle prendra la forme d'un décorateur dans la chaîne, jamais d'une implémentation sœur de l'exécution.

**Vocabulaire imposé** : un mot par concept. `scope` pour les permissions. `sandbox` uniquement si quelque chose confine réellement un processus.

## Avertissement de sécurité — à conserver dans la documentation publique

**La vérification de commandes n'est pas une frontière de sécurité.** Inspecter les arguments protège contre l'*accident* — un agent qui se trompe de chemin. Pas contre l'*adversaire* : avec un LLM dans la boucle, l'entrée est potentiellement adversariale. Une injection de prompt via un fichier lu peut produire des appels conçus pour contourner la validation — traversée de chemin, liens symboliques, encodage.

**Seul un container est une frontière de sécurité.** Si le mode « politique » est un jour livré, la documentation doit dire explicitement qu'il s'agit d'un garde-fou d'ergonomie, sinon quelqu'un le déploiera en croyant être protégé.

## Conséquences

**Positives**

- Aucun overhead en V1.
- La forme cible compose au lieu d'alterner : on pourra avoir politique **et** container.
- L'observabilité (`record`) se branche dans la même chaîne — un seul concept pour deux besoins.
- Le même patron que le décorateur de métriques côté LLM (`ADR-AGENT-0007`) : une seule idée sur les deux coutures du système.

**Négatives**

- Il faudra résister à la tentation d'ajouter un cadre de permissions générique avant qu'un consommateur ne l'exige.
- Les contraintes portées par l'outil se répètent d'un outil à l'autre. Acceptable tant qu'ils sont peu nombreux.

## Ce qui est retenu de Meastro malgré tout

1. **Ne présenter au modèle que les outils autorisés** (`ToolSchemaGenerator.cs:56`). Un outil refusé n'est jamais annoncé — toute une classe d'échecs disparaît.
2. **La substitution transparente d'outils** pour les mocks (`_toolMapping`), vérifiée **après** la politique donc inexploitable pour s'échapper. Voir `ADR-AGENT-0006`.
3. **Les permissions qui ne peuvent que se restreindre** en descendant une chaîne.
4. **Le coût qui remonte l'arbre des appels imbriqués.** Voir `ADR-AGENT-0007`.

## Pièges relevés chez Meastro, à ne pas reproduire

- **Politique non typée dans un sac partagé** (`context.Variables["_permissions_allowedBlocks"]`, avec cast). Si la valeur transite par une sérialisation JSON, le cast échoue et toute la couche de refus est sautée **sans erreur**. En TypeScript ce serait pire. La politique se passe en objet typé explicite.
- **Deux points d'application aux sémantiques opposées** : la porte d'outils échoue en fermé, `FileAccessChecker` échoue en ouvert. Un seul point, et une politique malformée doit être une erreur fatale au démarrage.
- **Normalisation avant vérification** : `bash` est réécrit en `shell-execute` *avant* la consultation des permissions, donc une règle `Deny("bash")` ne matche jamais, silencieusement.
- **`RequiresApproval` qui ne demande rien** et renvoie une erreur au modèle. Voir `ADR-AGENT-0003` : chez nous, `step()` permettra de l'implémenter réellement.
