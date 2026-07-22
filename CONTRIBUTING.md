# Conventions de contribution (nathan-agent-core)

Branches, commits et PR. Trois formats, un seul principe : **l'identifiant JIRA voyage partout**, pour que la traçabilité ticket ↔ code ↔ PR ne repose sur la mémoire de personne.

---

## 1. Branches

```
type/JIRAID-nom-court
```

```
feat/DEV-194-package-initialisation
fix/DEV-207-stopreason-budget
docs/DEV-212-adr-tokenizer
```

| Segment | Règle |
|---|---|
| `type` | un de la liste ci-dessous, en minuscules |
| `JIRAID` | clé JIRA en MAJUSCULES + numéro : `DEV-194` |
| `nom-court` | 2 à 5 mots, minuscules, tirets. Décrit le *quoi*, pas le *comment*. |

**Types**, identiques à ceux des commits :

| Type | Usage |
|---|---|
| `feat` | nouvelle fonctionnalité |
| `fix` | correction de bogue |
| `refactor` | restructuration sans changement de comportement |
| `docs` | documentation, ADR, schémas |
| `test` | tests ou harnais uniquement |
| `chore` | outillage, dépendances, ménage |
| `build` | build, packaging, CI |

**Règles**

- Jamais de travail direct sur `main`. Seule exception : le commit d'amorçage du dépôt, déjà passé.
- Une branche = un ticket. Si le périmètre déborde, ouvrir un second ticket plutôt qu'élargir la branche.
- Branche supprimée après fusion.

---

## 2. Commits

```
type(scope): description (JIRAID)
```

```
feat(llm): ajouter OllamaLLMProvider (DEV-194)
fix(agent): stopReason incorrect quand le budget est atteint (DEV-207)
docs(schema): corriger les fleches UML des realisations (DEV-212)
build(ci): ajouter le workflow de revue (DEV-201)
```

L'identifiant est **en fin de sujet, entre parenthèses**. Ce placement garde le `scope` pour le domaine technique (l'information utile en lecture d'historique) tout en laissant JIRA rattacher le commit à son ticket.

**Scopes**, le domaine touché, aligné sur l'arborescence `src/` :

`llm` · `context` · `tools` · `agent` · `metrics` · `testing` · `schema` · `docs` · `ci`

Le scope est facultatif quand le changement est transverse : `chore: mettre a jour les dependances (DEV-220)`.

**Règles**, reprises de `.claude/commands/commit.md` :

- **Des commits séparés et logiques.** Un commit = un changement cohérent. Regrouper un refactor et une correction dans le même commit rend le `revert` impossible.
- **Jamais `git add -A` ni `git add .`** : stager les fichiers explicitement, un commit à la fois.
- **Jamais d'`amend`** sur un commit existant.
- **Pas de ligne `Co-Authored-By`.**
- Message concis, 1 à 2 lignes. Le corps est réservé au *pourquoi*, quand il n'est pas évident.
- **Pas d'emoji.** Les emojis cuisine de `C:\Marcel` sont spécifiques à ce projet-là et n'ont pas cours ici.

---

## 3. Pull requests

Le workflow `.github/workflows/claude-pr-description.yml` **génère le titre et le corps** à l'ouverture de la PR (événement `opened`), en détectant l'identifiant JIRA **depuis le nom de la branche** (d'où l'importance du format de la §1). La convention ci-dessous est celle que ce workflow applique : il en est la source de vérité.

**Titre**, la même forme que les commits (§2) :

```
type(scope): description (JIRAID)
```

- `type` : `feat | fix | refactor | docs | test | chore | build`
- `scope` : `llm | context | tools | agent | metrics | testing | schema | docs | ci` (facultatif si transverse)
- **JIRAID détecté depuis la branche. S'il est vide, on retire les parenthèses finales. On n'invente rien.**
- **Pas d'emoji** (§2).

**Corps**, quatre sections, **incluses seulement quand elles apportent quelque chose** :

| Section | Quand l'inclure | Contenu |
|---|---|---|
| **Changements** | toujours | liste à puces concise (6 max) de ce qui change |
| **Vérification** | sauf PR purement docs/chore | 2 à 4 puces, chacune = *quelle commande lancer + ce qu'on doit observer*. Le critère de fin de la PR est dans `docs/plans/2026-07-21-v1-decoupage-pr.md` pour chacune des six PR de la V1, s'y référer |
| **Décisions** | seulement si la PR touche un contrat public (un port `I*.ts`, la carte `exports`) ou s'écarte d'un ADR | citer l'ADR concerné. Une **nouvelle** décision d'architecture exige un ADR daté (`docs/decisions/`) : gouvernance du projet, ADR-0007 |
| **Impact** | seulement s'il y a rupture d'API publique, nouvelle dépendance, ou étape de migration pour les consommateurs | une rupture de contrat de baril (`barrel-contract.test.ts`) est **toujours** un Impact |

**Ce que le contributeur fait donc avant d'ouvrir la PR** : nommer la branche correctement (§1, pour que l'identifiant soit détecté) et vérifier le critère de fin de la PR. Le workflow rédige le reste.

---

## 4. Traçabilité

```
Ticket JIRA  →  branche  →  commits  →  PR  →  ADR (si décision)
   DEV-194      feat/DEV-194-…    (DEV-194)    (DEV-194)    ADR-AGENT-00XX
```

C'est le même schéma que le reste du projet (`PMC/CONTEXT-AGENT.md` §10.3), appliqué au code.

---

## 5. Conventions de code

### 5.1 Fichiers

- **TypeScript strict** : pas de `any` sans commentaire qui le justifie.
- Fichiers en **`kebab-case.ts`** ; ports en **`IPascalCase.ts`** (`ILLMProvider.ts`, `IContextProvider.ts`).
- **Un baril `index.ts` par couche.** Les consommateurs (internes comme externes) importent **depuis le baril**, jamais d'un fichier individuel.
- **Tests de contrat de baril** (`barrel-contract.test.ts`) : ils verrouillent l'API publique. Un export retiré par mégarde casse un test, pas un consommateur.
- `models/` : types seulement, aucune dépendance runtime, aucun import de SDK.
- Code simple et lisible ; commenter la logique non évidente (prompts, transformations). Pas de génériques sophistiqués pour un cas unique.
- Piège ESM + `NodeNext` : import relatif avec l'extension du fichier **émis**, donc `.js` même depuis un `.ts` : `import type { Message } from "./models/index.js"`.

### 5.2 Architecture

Hexagonale : ports et adaptateurs, séparation stricte. Le domaine l'impose (six ports, une quinzaine d'implémentations). La règle de placement par fichier, le patron de couches commun aux six frameworks, la distinction classes/fonctions et l'interdiction du registre runtime sont détaillés dans :

> **[`docs/conventions/architecture.md`](./docs/conventions/architecture.md)** : à lire avant de créer un fichier ou de déplacer du code.

Le *pourquoi* est dans les ADR (`docs/decisions/`), en particulier `ADR-AGENT-0001`, `-0002`, `-0009`, `-0005`.

### 5.3 Versioning

Deux versionings à ne pas confondre.

**Le package** est en **SemVer** (`version` dans `package.json`). Protocole de bump :

1. Modifier `version` dans `package.json` (ex. `0.1.0-alpha` → `0.1.0`, puis `0.1.0` → `0.2.0`). Les préversions portent un suffixe : `-alpha`, `-beta`, `-rc.1`.
2. Mettre à jour **Version courante** dans `README.md`.
3. Commiter : `chore: bump vX.Y.Z (JIRAID)`.
4. Tagger : `git tag vX.Y.Z`, puis `git push origin <branche> --tags`.
5. Les consommateurs repointent leur dépendance git : `…NATHAN-agent-package#vX.Y.Z`.

La consommation se fait **par tag git** (`github:A-World-Felt/NATHAN-agent-package#vX.Y.Z`), sans registre ni jeton npm. La publication au **registre GitHub Packages** (workflow `publish.yml` déclenché sur tag `v*`) n'est **pas encore en place** : c'est un lot séparé (DEV-204) ; cette section gagnera le flux registre quand il atterrira.

**Les agents**, eux, ne sont **pas** versionnés par un champ : un agent est un fichier TypeScript commité, la version c'est git, et « cette version est bonne » ce sont les tests/évals qui le prouvent. Ni champ `version`, ni registre runtime. Voir `ROADMAP.md` et `ADR-AGENT-0005`. Versionner un prompt n'a d'intérêt que si le harnais peut **mesurer** que la v2 bat la v1.
