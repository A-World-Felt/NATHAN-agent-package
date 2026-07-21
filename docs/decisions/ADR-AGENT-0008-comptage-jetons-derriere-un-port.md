# ADR-AGENT-0008 — Comptage de jetons derrière un port

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`

## Contexte

`IContextProvider` expose `maxTokens`. La fenêtre glissante doit donc décider ce qui rentre — et pour ça, savoir ce que pèse un historique.

Position initiale retenue puis révisée : « compter des messages, pas des jetons, pour éviter la dépendance à un tokenizer ». L'objection de l'équipe est juste :

> **« 8 messages » ne veut pas dire la même chose pour un modèle à 8k et un modèle à 128k.**

Or le package sert précisément à **comparer des modèles** (`ADR-AGENT-0006`). Tronquer au nombre de messages rend les comparaisons bancales : deux modèles ne reçoivent pas la même quantité réelle de contexte.

Mais un tokenizer exact est **spécifique au modèle** — `tiktoken` pour OpenAI, des variantes sentencepiece pour Llama et Mistral. Il n'existe pas de tokenizer universel, et chacun est une dépendance lourde (binaires wasm ou natifs). C'est exactement l'overhead que le projet refuse.

## Options évaluées

**A — Compter les messages.** Zéro dépendance, mais fausse les comparaisons entre modèles.

**B — Embarquer un tokenizer réel dès la V1.** Exact, mais lourd, et il en faut un par famille de modèles.

**C — Un port, avec une implémentation heuristique en V1.** Le coût est différé sans que la porte se ferme.

## Décision

**Option C.**

```ts
// context/interfaces/ITokenCounter.ts
export interface ITokenCounter {
  count(messages: Message[]): number;
}
```

- **V1** — `HeuristicTokenCounter` : caractères ÷ 4, documenté comme approximatif.
- **Plus tard** — une implémentation par famille de modèles, qui se branche sans toucher à `SlidingWindowContext`.

C'est la même logique que pour `ILLMProvider` et `IContextProvider` : ce qui varie selon le fournisseur passe derrière un port.

### Calibration gratuite

Le provider déclare après chaque appel combien de jetons l'historique a **réellement** pesé (`ADR-AGENT-0007`). L'erreur de l'heuristique est donc mesurable au lieu d'être devinée — et c'est ce qui dira quand il devient nécessaire de passer à un tokenizer réel, plutôt qu'une intuition.

## Conséquences

**Positives**

- Aucune dépendance en V1.
- La fenêtre glissante est écrite une fois ; changer de stratégie de comptage ne la touche pas.
- L'imprécision est mesurable, donc la décision de passer à un vrai tokenizer sera prise sur des chiffres.

**Négatives**

- L'heuristique caractères ÷ 4 est mauvaise sur du code et sur le français accentué — deux cas centraux pour NATHAN, dont l'agent écrit du MicroPython. Il faut donc s'attendre à devoir la remplacer, et prévoir une marge de sécurité sur `maxTokens` en attendant.
- Un port de plus dans le câblage.

**Suivi**

À réévaluer quand la calibration montrera une erreur qui déborde la marge, ou dès qu'un provider facturé rendra le gaspillage de contexte coûteux.
