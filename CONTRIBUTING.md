# Conventions de contribution — nathan-agent-core

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

**Types** — identiques à ceux des commits :

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

L'identifiant est **en fin de sujet, entre parenthèses**. Ce placement garde le `scope` pour le domaine technique — l'information utile en lecture d'historique — tout en laissant JIRA rattacher le commit à son ticket.

**Scopes** — le domaine touché, aligné sur l'arborescence `src/` :

`llm` · `context` · `tools` · `agent` · `metrics` · `testing` · `schema` · `docs` · `ci`

Le scope est facultatif quand le changement est transverse : `chore: mettre a jour les dependances (DEV-220)`.

**Règles**, reprises de `.claude/commands/commit.md` :

- **Des commits séparés et logiques.** Un commit = un changement cohérent. Regrouper un refactor et une correction dans le même commit rend le `revert` impossible.
- **Jamais `git add -A` ni `git add .`** — stager les fichiers explicitement, un commit à la fois.
- **Jamais d'`amend`** sur un commit existant.
- **Pas de ligne `Co-Authored-By`.**
- Message concis, 1 à 2 lignes. Le corps est réservé au *pourquoi*, quand il n'est pas évident.
- **Pas d'emoji.** Les emojis cuisine de `C:\Marcel` sont spécifiques à ce projet-là et n'ont pas cours ici.

---

## 3. Pull requests

Le titre suit **exactement** la même forme que les commits :

```
type(scope): description (JIRAID)
```

Le workflow `.github/workflows/claude-pr-description.yml` le génère à l'ouverture de la PR, ainsi que le corps (Changements / Vérification / Décisions / Impact). Il détecte l'identifiant **depuis le nom de la branche** — d'où l'importance du format de la §1.

**Avant d'ouvrir la PR**

- Le critère de fin de la PR est écrit dans `docs/plans/2026-07-21-v1-decoupage-pr.md` pour chacune des six PR de la V1. Le vérifier et montrer la sortie.
- Une nouvelle décision d'architecture exige un ADR daté (`docs/decisions/`) — c'est la gouvernance du projet (ADR-0007), pas une préférence.
- Un changement de contrat public — un port `I*.ts`, la carte `exports` — casse les repos consommateurs. Le signaler explicitement dans la section « Impact ».

---

## 4. Traçabilité

```
Ticket JIRA  →  branche  →  commits  →  PR  →  ADR (si décision)
   DEV-194      feat/DEV-194-…    (DEV-194)    (DEV-194)    ADR-AGENT-00XX
```

C'est le même schéma que le reste du projet (`PMC/CONTEXT-AGENT.md` §10.3), appliqué au code.
