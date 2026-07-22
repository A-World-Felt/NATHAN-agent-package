# @a-world-felt/nathan-agent-core

> **Version courante : 0.1.0-alpha** (préversion). L'API publique n'est pas encore figée ; seul le point d'entrée `.` (les modèles du contrat) est livré. Voir [ROADMAP.md](./ROADMAP.md).

Un moteur agentique LLM **réutilisable** : le **moteur** (providers LLM, outils, boucle, mémoire), les **définitions d'agents** (prompt + outils) et un **harnais de test d'agents**. Agnostique du provider **et** de l'application : **le repo consommateur choisit son provider et apporte ses propres outils**. Il se branche dans n'importe quel projet Node/TypeScript.

Le raisonnement derrière chaque choix de conception est dans [`docs/decisions/`](./docs/decisions) (les ADR).

- **ESM pur** (`"type": "module"`, `NodeNext`). Node ≥ 18.
- **Package privé et restreint** (`@a-world-felt`). Repo : `A-World-Felt/NATHAN-agent-package`.

---

## Installation

Le package se consomme en **dépendance git par tag** : npm clone le repo, lit son `package.json` et le résout sous le nom scopé. **Aucun jeton npm requis** : l'authentification passe par git (SSH, ou HTTPS avec un jeton GitHub qui a accès au repo privé). npm exécute le `prepare` (build `tsc`) à l'installation.

```bash
npm i github:A-World-Felt/NATHAN-agent-package#v0.1.0-alpha
```

Dans le `package.json` du consommateur, la clé de dépendance est le **nom scopé** ; la valeur est la spec git :

```json
{
  "dependencies": {
    "@a-world-felt/nathan-agent-core": "github:A-World-Felt/NATHAN-agent-package#v0.1.0-alpha"
  }
}
```

On épingle une **version** via le tag (`#vX.Y.Z`) ; pour repointer, on change le tag (voir la convention de versioning dans [CONTRIBUTING.md](./CONTRIBUTING.md)).

---

## Setup côté consommateur

Ce package est **ESM pur** et n'expose son code et ses types **que** par la carte `exports`. Ton projet consommateur doit donc être en **ESM** (`"type": "module"`) et en résolution **NodeNext**, faute de quoi ni le code ni les types ne se résolvent : une résolution classique (`"moduleResolution": "node"`) ne sait pas lire une carte `exports`.

Le minimum à avoir dans le projet qui consomme le package :

```jsonc
// package.json (du consommateur)
{
  "type": "module"
}
```

```jsonc
// tsconfig.json (du consommateur)
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true
  }
}
```

En NodeNext, tes propres imports relatifs portent aussi l'extension `.js`, même depuis un `.ts`.

---

## Points d'entrée

Trois sous-chemins, **à la carte** : un agent ne reçoit que ce qu'on lui passe, rien d'implicite.

| Sous-chemin | Contenu | État en `0.1.0-alpha` |
|---|---|---|
| `.` | moteur, ports, types (**aucun accès disque**, importable partout) | **disponible** (modèles du contrat) |
| `./tools` | outils fichiers génériques (couplés à `fs`, opt-in) | **à venir** (PR2+) |
| `./testing` | harnais de test (faux provider, simulateur, scénarios) | **à venir** (PR5) |

> En `0.1.0-alpha`, seul `.` résout vers du code. `./tools` et `./testing` sont déclarés dans la carte `exports` (les 3 points d'entrée sont un choix de conception, `ADR-AGENT-0002`) mais leurs frameworks sont encore des squelettes : **ne pas les importer avant les PR qui les remplissent.**

### Ce que `.` exporte aujourd'hui

Les **modèles du contrat**, des types purs, sans dépendance runtime, qui *sont* le contrat que les implémentations respecteront :

- **LLM** : `Role`, `Message`, `ToolCall`, `ToolResult`, `Usage`, `LLMResponse`, `LLMErrorCode`, et la classe `LLMError`.
- **Outils** : `JSONSchemaType`, `JSONSchemaProperty`, `ToolSchema`.

### Exemple minimal

```ts
import { LLMError, type Message, type ToolSchema } from "@a-world-felt/nathan-agent-core";

// Un message de conversation, tel qu'envoyé au modèle.
const salut: Message = { role: "user", content: "amène-moi aux réglages" };

// Le schéma des paramètres d'un outil, tel que présenté au modèle.
const navigate: ToolSchema = {
  type: "object",
  properties: { page: { type: "string", description: "page cible" } },
  required: ["page"],
};

// Les erreurs de provider remontent (contrairement aux échecs d'outil) et portent un code.
const err = new LLMError("UNKNOWN_PROVIDER", "provider inconnu");
console.log(salut.role, navigate.required, err.code);
```

Cet import **compile** et **s'exécute** contre `0.1.0-alpha` : c'est la vérification d'installation de la PR1.

---

## Configuration

**Une librairie ne lit pas de fichier de config.** Elle lit `process.env` ; c'est **l'application** consommatrice qui charge son `.env` (par ex. via `dotenv` dans son point d'entrée). Ce package ne charge jamais de `.env` à l'import : le faire injecterait des variables dans le `process.env` du consommateur, ce qui n'est pas le rôle d'une librairie.

Les clés d'API et URL de provider passent donc **par l'environnement du consommateur**, jamais en dur, jamais commitées. Les variables concrètes (endpoint Ollama, etc.) arrivent avec le port LLM en PR2.

---

## ⚠️ Avertissement de sécurité

**La vérification de commandes n'est pas une frontière de sécurité.** Elle protège contre l'accident, pas contre l'adversaire : avec un LLM dans la boucle, une injection de prompt peut produire des appels conçus pour la contourner. **Seul un container est une frontière de sécurité.** Un outil doté d'un accès large (écriture disque, shell) doit être isolé par le consommateur. Justification : `ADR-AGENT-0004`.

---

## Développement du package

> Ces commandes servent à **développer ce package**, pas à le consommer. Pour l'utiliser dans un projet, voir « Setup côté consommateur » ci-dessus.

```bash
npm run build       # tsc -p tsconfig.build.json → dist/
npm test            # node:test, zéro dépendance
npm run typecheck   # tsc --noEmit
```

Le build produit `dist/index.js` **et** `dist/index.d.ts`. Piège ESM + `NodeNext` : les imports relatifs portent l'extension du fichier **émis**, donc `.js` même depuis un `.ts` : `import type { Message } from "./models/index.js"`.

---

## Pour aller plus loin

| Document | Contenu |
|---|---|
| [ROADMAP.md](./ROADMAP.md) | les 4 versions et la carte cible de l'arborescence |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | branches, commits, PR, conventions de fichiers/architecture/versioning |
| [`docs/decisions/`](./docs/decisions) | les ADR, le *pourquoi* de chaque choix |
| [`docs/plans/`](./docs/plans) | le découpage en 6 PR de la V1 |
