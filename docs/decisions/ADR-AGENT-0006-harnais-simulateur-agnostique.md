# ADR-AGENT-0006 — Harnais : simulateur à état, agnostique du lanceur

- **Statut** : ✅ Accepté
- **Date** : 2026-07-21
- **Décideurs** : Arthur-Olivier Fortin
- **Portée** : `@a-world-felt/nathan-agent-core`

## Contexte

Le harnais est **ce qui justifie le package**. Une boucle d'agent, c'est deux cents lignes que n'importe qui réécrit ; ce qui est difficile et réellement réutilisable, c'est de pouvoir tester quelque chose de non déterministe. C'est aussi la seule partie sans précédent maison — ni Marcel ni `NATHAN-jira-package` n'ont d'équivalent.

Besoin formulé : *« mettre un agent dans une app et vérifier s'il est capable de naviguer dedans. Avant de le mettre dans l'app, lui donner les tools : changer des pages, fetch la position actuelle, cliquer sur les composantes. Mais au lieu de vraiment le mettre dans l'app, quand il demande fetch page, ça retourne la liste de l'app mock qui n'existe pas. Quand il change de page, ça change juste une variable. L'agent n'a aucune idée qu'il n'est pas vraiment dans l'app. »*

Puis : *« un harnais qui change les modèles et vérifie les mêmes critères, avec une visualisation des coûts, durée, réussite selon les paramètres — modèle, type de mémoire, etc. »*

### Le principe qui rend ça possible

L'agent n'a **aucun accès au monde** en dehors des résultats d'outils. Contrôler cette frontière, c'est contrôler sa réalité entière. Ce n'est pas une astuce de test, c'est une propriété structurelle.

Meastro exploite exactement ça (`_toolMapping`, `ToolDispatcherBlockExecutor.cs:62-73`) : une table de substitution redirige les identifiants d'outils vers des blocs de capture qui enregistrent l'intention et renvoient des réponses réalistes sans toucher au disque. Vérifiée **après** les permissions, donc inexploitable pour s'échapper.

## Une distinction qui change l'API : mock ≠ simulateur

- Un **mock** renvoie une valeur figée. Sans état.
- Ce qui est décrit ici est un **simulateur** : plusieurs outils partageant un état mutable et cohérent. `navigate("réglages")` puis `getCurrentPage()` doit renvoyer `"réglages"`.

Un `mockTool(name)` sans état ne couvre pas le besoin.

## Options évaluées

**A — Mocks sans état, un par outil.** Insuffisant : ne modélise pas la navigation.

**B — Simulateur : une fabrique d'environnement dont les outils sont des vues sur un état partagé.** L'assertion finale porte sur l'état du simulateur.

**C — Enregistrement/rejeu de traces réelles.** Fidèle, mais exige une vraie app — qui n'existe pas encore — et casse dès que l'app change.

## Décision

**Option B**, sur deux niveaux.

### Niveau 1 — le scénario

```ts
const naviguer = defineScenario({
  name: "aller aux réglages",
  env: () => fakeApp({ pages: ["accueil", "réglages", "profil"], current: "accueil" }),
  input: "amène-moi aux réglages",
  expect: {
    toolsUsed: ["navigate"],
    finalState: (s) => s.current === "réglages",
    stopReason: "completed",
  },
});
```

### Niveau 2 — la matrice

```ts
const report = await runMatrix({
  scenarios: [naviguer, chercher, écrire],
  axes: { model: ["qwen2.5-coder", "llama3.1"], memory: [slidingWindow(8), slidingWindow(20)] },
  runs: 5,
});
report.toJSON();  report.toCSV();
```

`axes` en produit cartésien plutôt que des champs figés : modèle et mémoire aujourd'hui, température ou `maxIterations` demain, sans changer la signature.

### Trois règles non négociables

1. **`env` est une fabrique, pas une instance.** Chaque exécution repart d'un état neuf. Sinon la 2ᵉ des 5 répétitions démarre où la 1ʳᵉ s'est arrêtée et les taux ne veulent rien dire. Bug invisible.
2. **Les attentes sont des prédicats, pas une séquence stricte.** Exiger l'ordre exact fait échouer un modèle qui appelle `getCurrentPage` avant `navigate` alors qu'il a raison.
3. **Le rapport conserve les échecs, pas seulement les taux.** « 60 % de réussite » n'apprend rien sans voir ce qu'ont fait les 40 %. Chaque exécution ratée garde sa trace : appels d'outils, état final, `stopReason`.

### Une exécution ne mesure rien

Les modèles sont non déterministes : un succès sur un essai ne distingue pas un modèle à 95 % d'un modèle à 60 %. `runs: N` par combinaison, agrégé en taux. Conçu dès le départ — l'ajouter après change la signature.

## Deux suites distinctes, deux outils

| | Ce que ça teste | Outil |
|---|---|---|
| **Tests unitaires** | notre boucle : dispatch, `maxIterations`, terminaison. Déterministe. | `node:test` (zéro dépendance) |
| **Évals** | le modèle. Non déterministe, lent, payant en V2. | **pilote maison**, lancé à la main |

Le harnais est **agnostique du lanceur** : il retourne un résultat, le consommateur affirme avec ce qu'il veut. Le coupler à vitest en ferait une dépendance de pair imposée aux repos consommateurs.

Une éval n'est pas une suite de tests : elle ne pense pas en réussi/échoué mais en **taux**, sur une **matrice**, et produit un **rapport**. Elle ne bloque jamais un commit. Ce qu'il faut n'est donc pas un lanceur de tests, mais une boucle et un tableau — petit, et justifié.

## Le package émet des données, il n'affiche rien

Une interface web est envisagée plus tard. Elle n'a pas sa place dans une librairie : `toJSON()` / `toCSV()` suffisent, et l'interface se construira dans le repo IDE. Si la forme du rapport est correcte, elle ne coûtera rien.

**Investir dans la structure du rapport, pas dans l'affichage.**

## Conséquences

**Positives**

- Le package livre le faux provider et le simulateur — sans ça, chaque consommateur les réécrit, mal.
- Aucune dépendance de test imposée aux consommateurs.
- Le même harnais sert les deux suites : avec le faux provider il teste la boucle de façon déterministe, avec un vrai provider il évalue le modèle.
- Rendu possible par `step()` (`ADR-AGENT-0003`) : le harnais pilote l'exécution des outils au lieu de la subir.

**Négatives**

- Un simulateur est du code à écrire et à maintenir pour chaque domaine testé. Le package fournit la mécanique ; les simulateurs de l'IDE vivront dans le repo IDE.
- Un simulateur diverge de l'app réelle avec le temps. Un scénario vert ne garantit pas que ça marche en vrai — c'est un test d'intégration qui manquera toujours.

**Aucune table de substitution n'est nécessaire**

Meastro a besoin d'une table de redirection (`_toolMapping`) parce que ses outils sont des manifestes sur disque résolus par identifiant à l'exécution — il n'y a pas d'autre moyen d'injecter une implémentation différente.

Ici, `ITool` est une interface et les outils sont passés en objets : la substitution se fait **à la construction**, en passant simplement d'autres objets. L'abstraction, c'est l'interface elle-même. Voir `ADR-AGENT-0010`.

C'est aussi ce qui évite d'hériter du piège de Meastro : `_toolMapping` y est une variable de session propagée entre sessions — un agent capable d'écrire des variables de session pourrait recâbler ses propres outils.
