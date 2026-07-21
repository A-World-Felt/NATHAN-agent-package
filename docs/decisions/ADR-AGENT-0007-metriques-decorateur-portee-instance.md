# ADR-AGENT-0007 — Métriques par décorateur, portée par instance

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`

## Contexte

Besoin formulé : *« une instance entre llmProvider qui relaie les messages mais s'occupe de passer les métriques à l'instance qui s'occupe du monitoring des coûts, tokens, etc. »*, avec une API `start monitoring` / `read` / `stop` permettant d'accumuler dans un objet donné puis de cesser d'y accumuler.

Objectif final : comparer des modèles sur coût, durée et réussite (`ADR-AGENT-0006`).

## Métriques ≠ tokenizer

Deux besoins souvent confondus :

- **Comptabiliser ce qui a été consommé** — le provider le déclare lui-même. Ollama renvoie `prompt_eval_count` / `eval_count` ; OpenAI renvoie `usage.prompt_tokens` / `completion_tokens`. Rien à compter localement : le fournisseur est la source de vérité pour la facturation.
- **Décider ce qui rentre dans la fenêtre avant d'envoyer** — c'est un autre métier, traité par `ADR-AGENT-0008`.

Le décorateur de métriques n'a donc besoin d'aucun tokenizer.

> **À vérifier contre le vrai endpoint Ollama avant de coder.** Les noms de champs ci-dessus ne doivent pas être repris de mémoire (règle anti-hallucination n°2 de `CLAUDE.md`).

## Options évaluées

**A — Chaque appelant lit `response.usage` et agrège lui-même.** Aucune infrastructure, mais l'agrégation est réécrite partout et rien ne remonte à travers les appels imbriqués.

**B — Décorateur sur `ILLMProvider`, avec portée par `start`/`stop`.** La proposition initiale.

**C — Décorateur sur `ILLMProvider`, avec portée par instance du collecteur.** Même mécanisme de relais, mais la durée de vie de l'objet *est* la portée.

## Décision

**Option C.**

```ts
const metrics  = createMetricsCollector();
const provider = withMetrics(ollama, metrics);   // implémente ILLMProvider

const r = await runAgent(...);

metrics.total();   // { calls, tokensIn, tokensOut, durationMs }
```

`withMetrics` implémente `ILLMProvider` et délègue. Ni l'agent ni le provider ne savent qu'il est là.

### Pourquoi pas `start` / `stop`

L'accumulation pilotée dans le temps est de l'**état ambiant**, avec deux modes de panne certains :

- **Les tests s'exécutent en parallèle.** Deux scénarios simultanés accumulent dans le même objet. Les métriques deviennent du bruit, sans erreur visible.
- **Un `stop()` oublié** fait fuiter les métriques d'un test dans le suivant.

C'est exactement le piège relevé chez Meastro : de l'état sensible qui voyage dans un sac partagé ambiant (`_toolMapping`, `context.Variables[...]`).

Avec la portée par instance, chaque exécution fabrique son collecteur : parallèle-sûr par construction, et pour l'éval multi-modèles, un collecteur par exécution donne naturellement une ligne par run.

### Les tarifs ne vivent pas dans le package

Les prix changent ; en dur, ils périment le package et forcent une republication.

```ts
metrics.total({
  rates: {
    "qwen2.5-coder": null,                      // local — non facturé
    "gpt-4o-mini":   { in: 0.15, out: 0.60 },   // $ / M jetons
  },
});
```

Le consommateur charge sa config comme il veut et passe l'objet ; **le package ne lit aucun fichier** — sinon le point d'entrée `.` traînerait `fs` (`ADR-AGENT-0002`). Le package fait l'arithmétique et l'agrégation.

La clé de jointure est `ILLMProvider.model`, déjà présent dans le diagramme d'origine.

### Trois règles

1. **Unités explicites.** Par jeton, par millier, par million ? C'est la première source d'erreur sur ce type de table. L'unité doit être dans le nom du type ou en commentaire obligatoire.
2. **Absent ≠ zéro.** Un modèle local n'est pas gratuit, il est *non facturé* : il consomme du temps, de l'électricité, de la VRAM. Si Ollama sort à `0 $`, il gagne toutes les comparaisons de coût sans que ça veuille rien dire. Rapporter `null`, et laisser lire la colonne durée à côté.
3. **Pas de score composite.** Meastro calcule une `FitnessScore` unique — `(P × S × W) / (C_norm × C_compute × C_hw)^λ`. Un λ à régler, et on ne sait plus si un modèle gagne parce qu'il réussit mieux ou parce qu'il coûte moins. Émettre les dimensions séparément : taux de réussite, coût, latence. L'arbitrage revient à l'humain.

## Conséquences

**Positives**

- Aucun couplage : l'agent ignore le décorateur, le provider aussi.
- `withMetrics` enveloppe **n'importe quel** `ILLMProvider`, y compris le faux — la mécanique de métriques se teste de façon déterministe, sans réseau.
- Même patron que la chaîne `record → authorize → execute` côté outils (`ADR-AGENT-0004`) : un seul concept sur les deux coutures du système.
- Le package ne périme pas quand les tarifs changent.

**Négatives**

- Un décorateur de plus dans le câblage du consommateur.
- Le coût ne devient informatif qu'avec un provider facturé : en V1 sur Ollama, la colonne vaudra `null` partout. La plomberie doit exister quand même.

**Ordre d'implémentation**

`LLMResponse.usage` est rempli par l'adaptateur **dès la PR2** — le rétro-ajouter dans chaque adaptateur plus tard coûte cher. Le collecteur et `withMetrics` arrivent en PR6, avec le harnais qui les consomme.
