# ADR-AGENT-0005 — Agents déclarés en TypeScript, versioning par git

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`

## Contexte

Exigence formulée : « on pourrait enregistrer des agents génériques dans le package, mais c'est plus, mettons, pour une app qui inclut le package : les prompts/configs sont setupables dans un JSON, la personne pourrait commit "ok telle version est bonne" et faire des tests. »

Le diagramme de classes ne contient rien de tel : `AgenticLLM` reçoit son prompt et ses outils en paramètres de construction. Il n'existe aucun objet « définition d'agent » indépendant de l'exécution.

Trois questions à trancher : **où vivent les définitions**, **sous quel format**, et **comment se fait le versioning**.

### Ce que l'analyse a montré

- **Marcel n'a aucun versioning de prompts.** Recherche exhaustive : zéro occurrence de `PROMPT_VERSION`, `promptVersion`, `promptRegistry`, `getPrompt`. Aucune table `prompt` en base, aucune migration. Les prompts sont des littéraux interpolés dans des fonctions pures, un fichier par site d'appel, versionnés **par git uniquement**. Leurs propres notes traitent un changement de prompt comme « validate in a manual gate ».
- **Marcel a tenté un registre nommé, et il a dérivé.** `src/llm/models/index.ts:62` :
  ```ts
  feature: string;  // 'generation' | 'replace' | 'chat' | 'coverage-check' | etc.
  ```
  L'union réelle vit dans le commentaire. En quelques mois la liste documentée est devenue partiellement fictive : `coverage-check` n'existe pas en production comme `feature`.

## Options évaluées

**A — Registre runtime avec recherche par nom.** `registry.get("navigateur")`. Reproduit exactement le mode de dérive observé chez Marcel si les clés sont des `string`.

**B — `defineAgent()` en TypeScript, agents exportés en `const`, importés statiquement.** Types gratuits, aucun code de validation à écrire, diff git lisible, aucune recherche par nom.

**C — Définitions en JSON/YAML chargées à l'exécution.** Un prompt change sans recompiler. Exige un schéma et du code de validation ; JSON n'accepte pas les commentaires et encaisse mal le texte long multi-ligne — or un prompt système *est* du texte long qu'on veut annoter.

## Décision

**Option B, marquée « pour le moment ».**

```ts
export const navigateur = defineAgent({
  name: "navigateur",
  prompt: "…",
  tools: [navigate, getCurrentPage],
});
```

`defineAgent()` est une fonction pure qui retourne un objet typé. **Aucun registre runtime, aucune clé `string` non typée.**

Critère qui a tranché entre B et C : *est-ce qu'un prompt doit pouvoir changer sans rebuild ?* Réponse actuelle : non.

`defineAgent()` étant une fonction, ajouter un chargeur JSON/YAML plus tard n'invalide rien de cette décision.

### Le versioning n'est pas construit

Il n'y a **ni champ `version`, ni registre, ni base de données**. Un agent est un fichier TypeScript commité :

- la **version**, c'est git ;
- « cette version est bonne », ce sont **les tests qui le prouvent**.

Ça élimine le problème des deux compteurs divergents : un champ `version` par agent aurait dérivé du `npm version` du package, et il aurait fallu décider lequel fait foi.

## Conséquences

**Positives**

- Zéro code de validation de schéma à écrire et à maintenir.
- L'autocomplétion et le typage fonctionnent sur les définitions d'agents.
- Impossible de reproduire la dérive du `feature: string` de Marcel : il n'y a pas de clé texte.
- Le versioning est gratuit et déjà outillé (git, blame, PR, revert).

**Négatives**

- Changer un prompt exige de recompiler et republier le package — ou, pour un agent défini côté consommateur, de rebuilder son app.
- Un utilisateur non développeur ne peut pas ajuster un prompt. Non bloquant : les agents sont écrits par l'équipe.

**Lien avec les autres décisions**

Le versioning n'a d'intérêt que si l'on peut **mesurer** qu'une v2 de prompt bat la v1. Versioning et évaluation sont la même fonctionnalité vue sous deux angles — sans le harnais de `ADR-AGENT-0006`, un versioning ne serait que du changelog.

**Règle générale qui en découle, applicable partout dans le package**

> Si une clé est une chaîne, elle doit être typée. Le bon précédent est `Marcel/src/llm/providers/index.ts:25` — `PROVIDERS: Record<ProviderID, () => ILLMProvider>`, fermé, typé, piloté par variable d'environnement.
