# Roadmap — nathan-agent-core

Quatre versions. Les couches étant agnostiques du fournisseur, **le choix du provider est une décision tardive** : on démarre sur ce qui est gratuit et local, on monte en qualité ensuite.

Le raisonnement derrière chaque choix est dans `docs/decisions/`. Le découpage en PR de la V1 est dans `docs/plans/2026-07-21-v1-decoupage-pr.md`.

---

## Consommateur cible

Le package sert d'abord **l'IDE accessible de NATHAN** (ADR-0006 projet, Flux E) : un assistant vocal pour personnes non-voyantes, capable de **naviguer dans l'application et d'y écrire**. L'agent traduit la dictée en MicroPython.

Contrainte permanente, formulée par l'équipe :

> **Pas d'overhead. Ça doit rester maintenable.**

C'est le critère qui a écarté le cadre de permissions générique (`ADR-AGENT-0004`), le tokenizer embarqué (`ADR-AGENT-0008`) et le registre runtime (`ADR-AGENT-0005`).

---

## V1 — Le moteur, sur Ollama

**Toutes les couches de l'agentique, un seul provider, aucune clé d'API.**

| Couche | Contenu |
|---|---|
| LLM | `ILLMProvider`, `OllamaLLMProvider`, `FakeLLMProvider` |
| Outils | `ITool`, `dispatchTool`, trois outils fichiers (opt-in via `./tools`) |
| Agent | `step()`, `makeRunAgent`, `stopReason` |
| Contexte | `IContextProvider`, `SlidingWindowContext`, `ITokenCounter` |
| Définitions | `defineAgent()` en TypeScript |
| Harnais | simulateur, scénarios, matrice, métriques |

**Pourquoi Ollama** : local, gratuit, zéro clé. C'est la seule option réellement gratuite (voir le correctif plus bas). Permet de valider la boucle et le harnais sans dépenser un sou ni gérer de secrets.

**Pas de couche de permissions.** Les contraintes sont portées par les outils : un `WriteFile` construit avec un répertoire racine refuse d'en sortir. Dix lignes, aucun cadre. Détail et avertissement de sécurité : `ADR-AGENT-0004`.

### Découpage en six PR

Chaque PR ne dépend que des précédentes, et **chaque PR se vérifie**. Détail complet, pièges compris : `docs/plans/2026-07-21-v1-decoupage-pr.md`.

| PR | Contenu | Critère de fin |
|---|---|---|
| **1** | packaging (3 branches d'`exports`, `tsconfig` ×2) + `models/` + schéma | `npm run build` produit `dist/` ; `npm install` réussit depuis un repo test |
| **2** | `ILLMProvider` + `OllamaLLMProvider` + **`FakeLLMProvider`** | test déterministe sur le faux ; un appel réel à Ollama, sortie montrée |
| **3** | `IContextProvider` + `ITokenCounter` + `SlidingWindowContext` | un historique qui déborde est tronqué ; `observe()` no-op |
| **4** | `AgenticLLM` (classe) + `step()` (fonction pure) + `ToolDispatcher` | boucle testée **sur le faux** : dispatch, `maxIterations`, `stopReason` |
| **5** | simulateur + `defineScenario` + `runScenario` | un scénario de navigation bout en bout, assertion sur l'**état du simulateur** |
| **6** | `runMatrix` + métriques + `toJSON`/`toCSV` | une matrice 2 × 2 × 5 → 20 exécutions, un taux par combinaison, un CSV lisible |

Trois points d'ordonnancement qui ne sont pas arbitraires :

- **La PR1 n'est pas une PR de fichiers vides.** Une arborescence sans contenu ne se vérifie pas. Le jalon est la **chaîne de distribution** — le package se construit et s'installe — avec les types comme seul contenu, puisqu'ils *sont* le contrat.
- **Le faux provider est en PR2, pas dans le harnais.** Sans lui, la PR4 testerait *le modèle* au lieu de *notre boucle*. Il sert aussi de vérification de l'interface : si le faux est pénible à écrire, le port est mauvais, et on l'apprend tout de suite.
- **`LLMResponse.usage` est rempli dès la PR2.** Le coût vaudra `null` partout en V1 sur Ollama, mais rétro-ajouter la plomberie dans chaque adaptateur plus tard coûte cher.

**Puis** : intégration dans le repo IDE, et retour ici quand un mur apparaît.

---

## V2 — Deuxième provider + évaluation sur vrai modèle

**Mesurer la qualité de l'appel d'outils, et faire enfin parler la colonne coût.**

- Un second adaptateur derrière le même port — **aucune modification du moteur**
- Évaluations réelles : vrai modèle, outils simulés, matrice sur plusieurs axes

> ### ⚠️ Correctif — l'abonnement ne donne pas l'API
>
> L'hypothèse initiale était de choisir OpenAI « parce que l'abonnement permet de faire des appels API, contrairement à Claude ou DeepSeek ». **C'est faux, et vérifié** : ChatGPT Plus (20 $/mois) et l'API OpenAI sont deux produits à facturation séparée. Plus couvre l'app web ; l'API est en paiement à l'usage par jeton, avec un solde à créditer à part.
>
> C'est vrai chez tout le monde : OpenAI et Anthropic vendent tous deux un *agent CLI* sur abonnement (Codex, Claude Code), aucun ne vend l'accès API brut sur abonnement. Pour une librairie qui appelle l'API depuis son propre code, c'est du prépayé par jeton partout.
>
> **Conséquence** : le provider V2 se choisit sur les vrais critères — **qualité de l'appel d'outils, coût au jeton, latence**. DeepSeek n'est plus à écarter (parmi les moins chers au jeton). OpenAI reste défendable, mais pas pour la raison invoquée.
>
> Sources : [OpenAI Help Center](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus) · [ChatGPT Plus n'inclut pas l'API](https://folding-sky.com/blog/why-use-api-keys-not-chatgpt) · [OpenAI Developer Community](https://community.openai.com/t/api-access-as-a-chatgpt-plus-subscriber/573409)

---

## V3 — Mémoire auto-alimentée

**Que l'agent devienne personnalisé par personne.**

Un `MemoryContextProvider` qui s'alimente tout seul, dans l'esprit d'un `CLAUDE.md` — mais par utilisateur, et écrit par l'agent lui-même au fil des échanges.

**Se branche sans rien casser** : `context/providers/memory/` se dépose à côté de `sliding-window/`, derrière le même `IContextProvider`. Le moteur ne bouge pas.

C'est la raison d'être du port : fenêtre glissante et mémoire sont **deux stratégies derrière un même contrat**. D'où `observe()` présent dès la V1, même si `SlidingWindowContext.observe()` y est un no-op littéral.

Enjeu d'accessibilité : pour une personne non-voyante qui dicte son code, un agent qui retient ses habitudes évite de tout réexpliquer à chaque séance.

---

## V4 — La voix

`IVoiceProvider` (`transcribe` / `synthesize`), la composition voix par-dessus `run-agent`, et les providers voix.

**Repoussée délibérément.** Deux raisons :

1. **Ollama ne fait ni transcription ni synthèse.** La voix en V1 aurait forcé un deuxième provider et des clés dès le premier jour — en contradiction avec « on commence simple ».
2. Le package agentique doit être terminé d'abord (décision de l'équipe).

`stream()` est dans `ILLMProvider` **dès la V1** en prévision : la synthèse vocale voudra parler pendant que le modèle écrit, pas après.

---

## Le cycle avec le repo IDE

Le vrai moteur d'amélioration du package n'est pas cette roadmap, c'est la confrontation à un consommateur réel :

```
V1 livrée → intégration dans le repo IDE → harnais sur les vraies fonctionnalités
   ↑                                                    │
   └──────── on revient améliorer le package ←──── un mur apparaît
```

**Point de vigilance.** D'après `PMC/CONTEXT-AGENT.md`, la stack IDE se tranche à `TECH-19` début S7 (janvier 2027) et le Flux E démarre à ce moment-là. Le package sera donc « fini » plusieurs mois avant l'existence de son consommateur.

Conséquence pratique : **garder la V1 vraiment minimale.** Chaque abstraction ajoutée d'ici là est un pari sans retour d'information — et c'est exactement comme ça qu'on construit la mauvaise abstraction.

---

## Ce qui n'a pas besoin d'être construit

**Le versioning des agents.** Ni champ `version`, ni registre runtime, ni base de données. Un agent est un fichier TypeScript commité ; la version, c'est git ; « cette version est bonne », ce sont les tests qui le prouvent. Voir `ADR-AGENT-0005`.

Versioning et évaluation sont la même fonctionnalité vue sous deux angles : versionner un prompt n'a d'intérêt que si l'on peut **mesurer** que la v2 bat la v1. Sans harnais, un versioning n'est que du changelog.

---

## Repoussé sans date

| Sujet | Condition de déclenchement |
|---|---|
| Couche de politique (permissions) | un consommateur expose une capacité large, type shell |
| Exécution en container | idem — et c'est la **seule** vraie frontière de sécurité |
| Approbation utilisateur avant écriture | quand le repo IDE en aura besoin ; `step()` la rend bon marché |
| Tokenizer réel par famille de modèles | quand la calibration montrera une dérive hors marge |
| Rendu des outils en prompt (modèles sans appel natif) | quand `supportsTools()` renverra `false` sur un modèle visé |
| Interface web des rapports | dans le repo IDE, jamais dans le package |
