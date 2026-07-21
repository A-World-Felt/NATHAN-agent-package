# ADR-AGENT-0011 — Budget et atterrissage gracieux plutôt que coupure sèche

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`
- **Complète** : [ADR-AGENT-0003](ADR-AGENT-0003-terminaison-boucle-machine-etats.md), dont la décision de terminaison (absence d'appel d'outil) reste inchangée. Seul le mécanisme de **bornage** change.

## Contexte

`ADR-AGENT-0003` a établi la terminaison naturelle : `toolCalls` vide ⇒ terminé. Il mentionnait `maxIterations` comme garde-fou, avec `stopReason: "max_iterations"`.

Objection de l'équipe : **une coupure sèche jette tout le travail de l'agent.** Après quinze itérations de recherche, retourner un résultat tronqué sans réponse rédigée est un mauvais produit — surtout pour une personne non-voyante qui a dicté une demande et attend une réponse parlée.

Deux pistes proposées : que l'agent déclare un statut (`reasoning` / `tool` / `done`), ou qu'un chronomètre déclenche une vérification lui demandant s'il a terminé.

## Pourquoi le champ `status` est écarté

**C'est `isDone` sous un autre nom.** Le statut serait produit par le modèle, donc peu fiable exactement dans le cas où il servirait : un agent parti en vrille rapporte `status: "reasoning"` indéfiniment. Le symptôme est généré par le processus défaillant lui-même.

Et il n'apporte aucune information nouvelle — le protocole d'appel d'outils la donne déjà, gratuitement et de façon fiable :

| Statut déclaré | Ce qui le dit déjà |
|---|---|
| `tool` | `toolCalls` non vide |
| `done` | `toolCalls` vide |
| `reasoning` | n'existe pas pour la boucle — c'est du contenu |

Coût net : des jetons, une surface de parsing, un mode de panne. Bénéfice : nul. Même raisonnement que le retrait d'`isDone` (`ADR-AGENT-0003`).

## Options évaluées

**A — Coupure sèche sur `maxIterations`.** Simple, prévisible, et jette le travail accompli.

**B — Champ `status` déclaré par le modèle.** Écarté ci-dessus.

**C — Budget qui déclenche un atterrissage.** Au lieu de couper, on demande à l'agent de conclure avec ce qu'il a.

## Décision

**Option C**, en deux mécanismes complémentaires.

### 1. Budget composite → atterrissage

Le budget est atteint dès que **l'une** des bornes tombe : itérations, durée écoulée, jetons consommés. Alors, plutôt que de retourner :

1. Injecter un message : « budget atteint, conclus avec ce que tu as ».
2. Rappeler le modèle **sans lui passer d'outils**.
3. Retourner sa réponse.

**Retirer les outils du dernier appel est ce qui garantit l'atterrissage.** Le modèle ne *peut* plus rien appeler : il rédige. Sans cette précaution, il rappellerait un outil et la boucle repartirait.

Coût : un appel LLM supplémentaire. Bénéfice : une réponse utilisable au lieu d'un résultat tronqué.

### 2. Détecteur de répétition

Le signal fiable de blocage n'est pas ce que l'agent dit de son état, c'est **la répétition** : le même outil, avec les mêmes arguments, N fois de suite. Observable de l'extérieur, sans rien demander au modèle, et il détecte la pathologie réelle — un agent qui tourne en rond.

Il déclenche le même atterrissage, mais **plus tôt** que l'épuisement du budget.

### `stopReason`

```ts
stopReason: "completed"   // fin naturelle — aucun appel d'outil
           | "budget"     // borne atteinte → atterrissage forcé
           | "stuck"      // répétition détectée → atterrissage forcé
           | "error"
```

`maxIterations` subsiste **comme dernier filet** contre un bug de boucle, pas comme mécanisme principal.

## Conséquences

**Positives**

- L'utilisateur reçoit toujours une réponse rédigée, jamais un résultat mutilé. C'est un gain d'accessibilité direct : une personne qui dicte attend une réponse parlée, pas un silence.
- Le détecteur de répétition intervient avant l'épuisement du budget — on économise les itérations gaspillées.
- **Nouvelle métrique d'évaluation gratuite** : « ce modèle conclut-il de lui-même, ou tape-t-il toujours le budget ? » Un modèle à 100 % de réussite mais systématiquement en `"budget"` n'est pas le même produit qu'un modèle qui termine naturellement. C'est exactement le genre de différence que le harnais doit faire ressortir (`ADR-AGENT-0006`).
- Le bornage par durée et par jetons est model-agnostique : comparer deux modèles sur « 10 itérations » n'a pas le même sens que sur « 30 secondes » ou « 50 000 jetons ».

**Négatives**

- Un appel LLM de plus à chaque sortie forcée. Négligeable devant les itérations déjà consommées.
- Trois bornes à configurer au lieu d'une. Atténué par des valeurs par défaut raisonnables — le consommateur n'en règle une que s'il a une raison.
- Le détecteur de répétition peut avoir des faux positifs : un agent qui relit légitimement le même fichier deux fois. Le seuil doit donc être ≥ 3, et il s'agit d'un atterrissage, pas d'une erreur — le coût d'un faux positif reste faible.

**Ce qui ne change pas**

La terminaison naturelle de `ADR-AGENT-0003` : `toolCalls` vide ⇒ `"completed"`. Le budget et le détecteur sont des mécanismes de **secours**, jamais le chemin nominal.
