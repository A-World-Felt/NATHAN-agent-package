# ADR-AGENT-0003 — Terminaison par absence d'appel d'outil, machine à états suspendable

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`
- **Complété par** : [ADR-AGENT-0011](ADR-AGENT-0011-budget-et-atterrissage-gracieux.md) — le bornage n'est plus une coupure sèche sur `maxIterations` mais un budget composite qui déclenche un **atterrissage gracieux**. `stopReason` devient `"completed" | "budget" | "stuck" | "error"`. La décision de terminaison ci-dessous (absence d'appel d'outil) est inchangée.

## Contexte

Le diagramme de classes d'origine décrit `AgenticLLM` avec une méthode privée `is_done(AgenticLLMResponse)`, accompagnée de cette annotation :

> *« Look to remove isDone. When the agent is finished, it calls the tool isDone. Every tools put the agent in waiting status. IsDone does the same except it's the user response that wakes him up. »*

L'annotation contient deux idées distinctes qu'il faut séparer : **comment l'agent signale qu'il a fini**, et **le fait que tout appel d'outil suspend l'agent**.

## Options évaluées

**A — Garder `isDone` comme outil explicite.**
Le modèle appelle `isDone` pour signaler la fin. Mode de panne gratuit : s'il oublie de l'appeler, la boucle tourne jusqu'à `maxIterations`. Consomme aussi une place dans la liste d'outils présentée au modèle.

**B — Terminaison native : l'absence d'appel d'outil est le signal.**
Tous les protocoles d'appel d'outils fonctionnent ainsi — le modèle renvoie du contenu sans `toolCalls`, c'est terminé. Rien à apprendre au modèle.

**C — Les deux, avec `isDone` optionnel.**
Deux chemins de terminaison à tester et à maintenir, pour aucun gain.

## Décision

**Option B pour la terminaison, et l'idée de suspension est conservée comme primitive.**

`isDone` est supprimé. `LLMResponse.toolCalls` vide ⇒ `stopReason: "completed"`.

Le cas « j'ai besoin de l'utilisateur », que l'annotation distinguait, se règle par la règle générale du package (`ADR-AGENT-0002`) : **c'est un outil du consommateur**. Un repo qui veut séparer « fini » de « j'ai une question » enregistre son propre `ask_user`. Le cœur, lui, s'arrête quand il n'y a plus d'appel d'outil.

La suspension devient la primitive, et la boucle du sucre par-dessus :

```ts
step(state: AgentState): Promise<AgentState>        // suspend sur appel d'outil
makeRunAgent(deps)(input): Promise<AgentResult>     // enroule step() jusqu'à l'arrêt
```

Le résultat dit pourquoi il s'est arrêté :

```ts
export type AgentResult = {
  content: string;
  toolCalls: ToolCall[];
  stopReason: "completed" | "max_iterations" | "error";
  iterations: number;
};
```

## Conséquences

**Positives**

- Un mode de panne en moins : plus de « le modèle a oublié d'appeler `isDone` ».
- Une place de moins dans la liste d'outils présentée au modèle.
- **Le harnais contrôle l'exécution des outils au lieu de la subir** — c'est `step()` qui rend le simulateur possible (`ADR-AGENT-0006`).
- L'approbation utilisateur avant une opération risquée devient implémentable pour de vrai plus tard : la plomberie de suspension existe déjà. C'est exactement ce qui manque à Meastro, dont le niveau `RequiresApproval` ne demande rien et se contente de renvoyer une erreur au modèle.
- `stopReason` donne au harnais un critère d'assertion net (« l'agent s'est-il arrêté au bon endroit »).

**Négatives**

- Un consommateur qui veut distinguer « terminé » de « en attente de l'utilisateur » doit écrire son propre outil. C'est voulu, mais ce n'est pas gratuit pour lui.
- La primitive `step()` élargit l'API publique : deux niveaux d'entrée à documenter au lieu d'un.

**À surveiller**

Un modèle qui ne supporte pas l'appel d'outils natif signalerait sa fin autrement. `ILLMProvider.supportsTools()` existe pour détecter ce cas ; le traitement associé n'est pas dans la V1.
