# Convention d'architecture (nathan-agent-core)

> Version contributeur des règles d'architecture. Le *pourquoi* détaillé est dans les ADR
> (`docs/decisions/`), notamment `ADR-AGENT-0001` (hexagonale), `ADR-AGENT-0002` (points
> d'entrée), `ADR-AGENT-0009` (classes vs fonctions), `ADR-AGENT-0005` (pas de registre).
> `.claude/CLAUDE.md` en donne la version orientée agent. En cas de doute, l'ADR fait autorité.

## Hexagonale : ports et adaptateurs

Séparation stricte entre contrats et implémentations. **Ce n'est pas une préférence de style : le domaine l'impose.** Presque tout ce que le package expose existe en plusieurs implémentations interchangeables derrière un contrat stable : six ports, une quinzaine d'implémentations. Un package dont la promesse est « le repo consommateur choisit son provider et apporte ses outils » ne peut pas être structuré autrement.

Les **4 bandes** du diagramme d'équipe sont exactement cette séparation :

| Bande | Correspondance dans `src/` |
|---|---|
| Applicatif | `agent/` |
| Interface | tous les `interfaces/` (`I*.ts`) |
| Implémentation Locale | les `providers/` et `infrastructure/` livrés |
| Implémentation Externe | écrite par le **repo consommateur**, pas ici |

## Les 3 points d'entrée

| Sous-chemin | Contenu | Contrainte |
|---|---|---|
| `.` | moteur, ports, `defineAgent` | **aucun accès disque**, importable partout |
| `./tools` | outils génériques fournis | opt-in, couplé à `fs` |
| `./testing` | harnais de test | ne doit **jamais** partir en production |

Les outils sont **à la carte** : un agent reçoit exactement les outils qu'on lui passe, rien d'implicite. Si les outils fichiers étaient dans le baril principal, importer le package traînerait `fs` derrière lui. Rien de `./testing` ne doit être atteignable depuis `.` ou `./tools`.

## Couches internes par framework

Chaque framework (`llm`, `context`, `tools`, `metrics`, `voice`, `agent`) suit le **même patron** (on apprend un composant, on les connaît tous) :

```
<framework>/
  models/            entités, types, enums : aucune dépendance runtime, aucun import SDK
  interfaces/        ports I*.ts (contrats seulement)
  services/          fonctions PURES, n'importe JAMAIS interfaces/
  application/
    dtos/            Deps, Input, Result, Options
    use-cases/       orchestration UNIQUEMENT
  providers/<vendor>/  adaptateurs concrets par fournisseur
  infrastructure/    autres adaptateurs concrets (I/O réel)
```

`context/` est un **framework à part entière**, pas un sous-dossier de `agent/` : fenêtre glissante et mémoire sont deux providers d'un même port `IContextProvider`.

## Règle de placement (arbre de décision par fichier)

1. Type/interface décrivant une **donnée** → `models/`
2. Interface décrivant un **port** (`I<X>`) → `interfaces/`
3. Fonction **pure** (ni disque, ni HTTP, ni SDK) → `services/`
4. Fonction qui prend un port et **orchestre** → `application/use-cases/`
5. Classe implémentant un port via de l'**I/O réel** → `providers/<vendor>/` ou `infrastructure/`

Invariants qu'une revue traite comme de vrais problèmes :

- `models/` : types seulement, aucun import de SDK, aucune dépendance runtime.
- `services/` : fonctions pures, **ne doit jamais importer `interfaces/`**.
- le baril `.` ne doit **jamais** importer `fs`/`path` ni rien de disque.

## Classes vs fonctions

| Nature | Forme | Exemples |
|---|---|---|
| **API publique** avec état et plusieurs opérations | **classe** | `AgenticLLM`, `VoiceAgenticLLM` |
| Adaptateur implémentant un port via de l'I/O | classe | `OllamaLLMProvider`, `SlidingWindowContext`, les outils |
| Fonction pure d'orchestration ou de calcul | fonction | `step`, `dispatchTool`, `defineAgent`, agrégation |

L'API publique est une **classe** (elle offre l'autocomplétion `agent.` qu'une fabrique n'expose pas, `ADR-AGENT-0009`) ; sa mécanique est une **fonction pure** testable sans instancier la classe. `AgenticLLM.run()` enroule `step(state, deps)`.

## Pas de registre runtime

`defineAgent()` est une fonction pure qui retourne un objet typé. Les agents sont des `const` exportés, importés **statiquement**. Aucune recherche par nom, aucune clé `string` non typée.

> **Si une clé est une chaîne, elle doit être typée.** Le mode de panne à éviter (observé en production ailleurs) : une union réelle qui ne vit que dans un commentaire (`feature: string; // 'a' | 'b' | …`) dérive en quelques mois. Forme correcte : `PROVIDERS: Record<ProviderID, () => ILLMProvider>`, union fermée, typée. Voir `ADR-AGENT-0005`.
