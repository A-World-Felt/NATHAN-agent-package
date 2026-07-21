# ADR-AGENT-0009 — Classes pour l'API publique, fonctions pures à l'intérieur

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`
- **Remplace** : `ADR-AGENT-0001` sur le point « use-cases en fonctions ». Le reste de `ADR-AGENT-0001` (architecture hexagonale, couches, règle de placement) **reste en vigueur**.

## Contexte

`ADR-AGENT-0001` a décidé que les use-cases seraient des fonctions à application partielle, par reprise de la convention de Marcel :

```ts
export const makeRunAgent = (deps) => async (input) => { … };
```

Cette décision est révisée. Le raisonnement d'origine transposait une convention de Marcel sans vérifier qu'elle s'appliquait.

**Marcel est une application, pas une librairie publiée.** Ses use-cases sont internes, câblés une fois dans `src/app/composition/`, et leur unique consommateur est Marcel lui-même. Dans ce contexte, la fonction à dépendances partielles est le bon outil : elle rend le câblage explicite au point de composition.

**Un package publié a une contrainte que Marcel n'a pas : une surface d'API publique**, consommée par des repos tiers et par des coéquipiers qui ne liront pas le code interne.

Modèle mental formulé par l'équipe : *« les app importent le package, déclarent un `AgenticLLM` ou un `VoiceAgenticLLM` et utilisent ses fonctions. »*

## Options évaluées

**A — Fonctions à application partielle** (`ADR-AGENT-0001`).
Cohérent avec Marcel. Mais `makeRunAgent(deps)` retourne une **fonction opaque** : rien n'y est découvrable, et `step()` doit être exporté séparément, ce qui casse le lien entre les deux.

**B — Classes pour tout, y compris le dispatch et les helpers.**
Fidèle au diagramme d'origine. Amène des classes sans état pour des fonctions pures, ce que `ADR-AGENT-0001` écarte à juste titre.

**C — Classes pour l'API publique, fonctions pures pour la mécanique interne.**
La classe est le point d'entrée ; l'orchestration testable reste une fonction.

## Décision

**Option C.**

```ts
export class AgenticLLM {
  constructor(deps: AgentDeps);                   // { llm, context, tools, maxIterations }
  run(input: AgentInput): Promise<AgentResult>;
  step(state: AgentState): Promise<AgentState>;   // le harnais pilote par là
}

export class VoiceAgenticLLM {
  constructor(deps: { agent: AgenticLLM; voice: IVoiceProvider });
  run(input: string | AudioBuffer): Promise<AgentResult>;
}
```

`AgenticLLM.run()` enroule une fonction pure `step(state, deps)` — testable sans instancier la classe.

### Ligne de partage

| Nature | Forme | Exemples |
|---|---|---|
| **API publique avec état et plusieurs opérations** | **classe** | `AgenticLLM`, `VoiceAgenticLLM` |
| Adaptateur implémentant un port via de l'I/O | classe | `OllamaLLMProvider`, `SlidingWindowContext`, les outils |
| Fonction pure d'orchestration ou de calcul | fonction | `step`, `dispatchTool`, `defineAgent`, agrégation |

Le reste de la règle de placement de `ADR-AGENT-0001` est inchangé.

## Justification, point par point

- **Découvrabilité.** `agent.` déclenche l'autocomplétion de l'API entière. Une fonction retournée n'expose rien.
- **L'objet a réellement un état et plusieurs opérations** : configuration partagée, `run()`, `step()`. C'est la définition d'usage d'une classe.
- **La composition se lit.** `new VoiceAgenticLLM({ agent, voice })` exprime directement ce que dessine le diagramme (`VoiceAgenticLLM` compose `AgenticLLM` et `IVoiceProvider`).
- **La testabilité n'est pas un argument** : une classe à dépendances injectées au constructeur se teste exactement comme une fonction à dépendances en paramètre. C'était l'erreur d'analyse de `ADR-AGENT-0001`.
- **Le vocabulaire de l'équipe est préservé.** `AgenticLLM` et `VoiceAgenticLLM` sont les noms établis dans le diagramme d'architecture et dans les échanges de l'équipe. Les renommer en `run-agent` aurait coupé le code de la documentation et des conversations.

## Conséquences

**Positives**

- L'API publique correspond au diagramme d'architecture — plus d'écart à documenter sur ce point.
- Un coéquipier qui découvre le package trouve son chemin par l'autocomplétion.
- La mécanique reste en fonctions pures : la testabilité de `ADR-AGENT-0001` est conservée intégralement.

**Négatives**

- Divergence assumée avec Marcel sur ce point précis. Elle est justifiée par une différence de nature entre les deux projets — application contre librairie — et doit être expliquée à qui connaît Marcel.
- Deux styles coexistent dans le package. La ligne de partage ci-dessus doit rester explicite dans `CLAUDE.md`, sinon elle se brouillera.

**Leçon de méthode**

Une convention observée dans un autre projet doit être **justifiée par le besoin d'ici**, pas transposée parce qu'elle existe ailleurs. Le repo voisin cité — une application privée, jamais publiée, que l'équipe ne connaît pas et qui n'est pas le consommateur du package — n'avait autorité sur rien. La bonne question n'était pas « que fait Marcel ? » mais « qu'est-ce qu'un développeur écrit quand il installe ce package ? ».

Voir `ADR-AGENT-0001` § « Sur les références externes » pour le cadrage général.
