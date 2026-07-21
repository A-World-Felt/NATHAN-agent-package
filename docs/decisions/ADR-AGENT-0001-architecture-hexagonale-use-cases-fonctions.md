# ADR-AGENT-0001 — Architecture hexagonale

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`
- **Complété par** : [ADR-AGENT-0009](ADR-AGENT-0009-classes-pour-api-publique.md) — classes pour l'API publique, fonctions pures à l'intérieur.

> **Note de révision (2026-07-21).** La justification de cet ADR a été réécrite le jour même de sa rédaction, avant tout commit et avant toute ligne de code. La version initiale motivait la décision par « reprise de la convention de Marcel » — une citation à la fois inexacte et inutile : l'équipe ne connaît pas Marcel, ce n'est pas le consommateur du package, et la décision découle du domaine. La **décision est inchangée** ; seul son fondement est corrigé.

## Contexte

Le package doit être structuré avant d'écrire du code.

**Le domaine impose l'architecture.** Presque tout ce que le package expose existe en plusieurs implémentations interchangeables derrière un contrat stable :

| Contrat | Implémentations prévues |
|---|---|
| `ILLMProvider` | Ollama, Gemini, Azure, externe, faux (tests), décorateur de métriques |
| `IContextProvider` | fenêtre glissante (V1), mémoire auto-alimentée (V3) |
| `ITool` | ReadFile, WriteFile, ListFiles, **plus tous ceux du consommateur** |
| `IVoiceProvider` | Gemini, Azure, externe (V4) |
| `ITokenCounter` | heuristique (V1), tokenizer réel (plus tard) |
| `IMetricsCollector` | collecteur en mémoire |

Ce n'est pas une préférence de style : **c'est la définition de ports et adaptateurs.** Un package dont la promesse est « le repo consommateur choisit son provider et apporte ses outils » ne peut pas être structuré autrement sans trahir sa promesse.

**Le diagramme d'architecture de l'équipe est déjà hexagonal.** Ses quatre bandes — `Applicatif`, `Interface`, `Implémentation Locale`, `Implémentation Externe (à implémenter)` — sont exactement la séparation ports/adaptateurs, avec la bande externe réservée aux repos consommateurs. La décision précède donc cet ADR : celui-ci l'acte et en tire les conséquences de placement.

## Options évaluées

**A — Plat, `src/*.ts`.**
Précédent maison : `NATHAN-jira-package`. Adapté à un client HTTP sans variantes. Ici, six contrats et une quinzaine d'implémentations finiraient mélangés dans un même dossier, et la frontière port/adaptateur — le cœur de la promesse du package — deviendrait invisible.

**B — Hexagonale, couches internes par domaine.**
Rend la frontière explicite dans l'arborescence. Coût : des dossiers peu peuplés au démarrage.

**C — Intermédiaire : un dossier par domaine, fichiers plats dedans.**
Moins de cérémonie. Mais la distinction port / adaptateur / fonction pure ne se lit plus dans les chemins, seulement dans les noms de fichiers.

## Décision

**Option B.**

```
<domaine>/
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

### `context/` est un domaine à part entière

Pas un sous-dossier de `agent/`. Fenêtre glissante et mémoire sont **deux providers d'un même port** — la V3 se dépose à côté de la V1 sans toucher à `AgenticLLM`. C'est la raison d'être du port ; l'enfouir sous `agent/` la masquerait.

### Topologie des providers

Quand **plusieurs fournisseurs servent un seul contrat**, ils sont imbriqués par fournisseur : `<domaine>/providers/<vendor>/`. C'est le cas de tous les ports ici. La coexistence de plusieurs providers actifs est un besoin explicite — le harnais multi-modèles en dépend (`ADR-AGENT-0006`).

## Conséquences

**Positives**

- La promesse du package — « choisissez votre provider, apportez vos outils » — est lisible dans l'arborescence.
- Ajouter un provider, c'est ajouter un dossier. Aucun fichier existant n'est touché.
- Les fonctions pures (`services/`) sont testables sans aucun montage.
- L'arborescence correspond au diagramme d'architecture, donc le code et la documentation ne divergent pas.

**Négatives**

- **Des dossiers peu peuplés au démarrage** : `llm/interfaces/` ne contient qu'un fichier en V1. C'est le prix de la lisibilité de la frontière, assumé.
- Plus de fichiers à ouvrir pour suivre un appel de bout en bout.
- Un contributeur qui découvre le package doit lire la règle de placement avant d'ajouter un fichier. D'où sa présence dans `CLAUDE.md`.

## Sur les références externes

`C:\Marcel` et `C:\Meastro` sont des **exemples du même patron**, utiles pour voir à quoi il ressemble en pratique et pour repérer ses pièges. Ils ne sont pas l'origine de cette décision, et ils n'ont autorité sur rien :

- Marcel est une application Next.js privée, jamais publiée, sans boucle agentique ni appel d'outils, et **ce n'est pas le consommateur de ce package**. Il n'expose aucune API publique — il ne peut donc rien dire sur la conception d'API (voir `ADR-AGENT-0009`, où cette confusion a été corrigée).
- Meastro est un backend C# dont le modèle d'exécution d'outils a été analysé pour ses **contre-exemples** (`ADR-AGENT-0004`).

Le consommateur réel est **l'IDE accessible de NATHAN**, construit dans `PMC/`. C'est lui, et lui seul, qui arbitrera si cette structure tient à l'usage.

Ce qui reste retenu de Marcel est une **observation datée**, pas une convention : le champ `feature: string` de `src/llm/models/index.ts:62`, dont l'union réelle vivait en commentaire et a dérivé en quelques mois dans du code de production. D'où la règle : *si une clé est une chaîne, elle doit être typée.*
