# Schémas — nathan-agent-core

## Fichier à lire : `Architecture-agent-core.drawio`

Cinq pages, **dans l'ordre**. Les quatre premières expliquent la mentalité ; la cinquième donne l'architecture complète. Ouvrir la page 5 en premier, c'est voir des boîtes sans comprendre pourquoi elles sont disposées ainsi.

| Page | Titre | Ce qu'elle fait comprendre |
|---|---|---|
| **1** | Vue de l'agent | Son univers entier tient dans des messages : un prompt, un historique, une liste de schémas d'outils. Tout le reste est derrière un **mur d'opacité**. Qui contrôle la frontière des outils contrôle sa réalité entière. |
| **2** | La substitution | Le même agent, deux mondes derrière le même `ITool` : la vraie app, ou le simulateur. **Identiques de son point de vue.** C'est le diagramme qui explique pourquoi on peut tester un agent sans app. |
| **3** | Une itération | Qui parle à qui, dans quel ordre. Chaque appel d'outil suspend l'agent — c'est cette suspension que le harnais pilote. L'absence d'appel d'outil est le signal d'arrêt. |
| **4** | Le harnais | Scénarios × axes × répétitions → un rapport. Pourquoi une seule exécution ne mesure rien, pourquoi `env` est une fabrique, pourquoi on garde les échecs. |
| **5** | Architecture complète | Le diagramme de classes, quatre bandes, 28 classes. À lire en dernier. |

## Pourquoi cinq diagrammes

Un diagramme de classes montre **ce qui existe**, pas **ce qui se passe**. La force de cette architecture est dynamique : l'agent agit sur un monde dont il ignore tout, et c'est cette ignorance qui rend le test possible. Aucune boîte ne dit ça — d'où les pages 1 à 4.

## Notation UML de la page 5

| Relation | Trait |
|---|---|
| réalise un port (`OllamaLLMProvider` → `ILLMProvider`) | pointillé + triangle creux |
| agrégation — détient une référence (`AgenticLLM` ◇→ `ILLMProvider`) | losange creux côté détenteur |
| dépendance (`Harnais` → `AgenticLLM`) | pointillé + flèche ouverte |

**Le pointillé n'a qu'un sens : la sémantique UML.** Le statut V3/V4 passe uniquement par le remplissage gris et l'étiquette — jamais par le trait. C'était une erreur d'une version précédente, où le pointillé signifiait tantôt « réalise un port », tantôt « pas encore construit ».

## Autres fichiers

| Fichier | Statut |
|---|---|
| `DiagrammeClasseAI.drawio` | **diagramme d'origine**, conservé tel quel. Référence historique. |
| `DiagrammeClasseAI-V1.drawio` | variante de l'équipe, non modifiée. |
| `DiagrammeClasse-agent-core.drawio` | ⚠️ **périmé** — remplacé par la page 5 d'`Architecture-agent-core.drawio`. Ses flèches sont fausses (trait plein pour des réalisations, pointillé à double sens). **À supprimer.** |

## Ce qui n'est pas vérifié

Les fichiers sont validés structurellement — XML bien formé, aucune arête orpheline, hauteurs de boîtes cohérentes, aucun chevauchement. **Le rendu visuel ne l'est pas** : le tracé des arêtes orthogonales et le débordement éventuel des textes ne se voient qu'en ouvrant le fichier dans draw.io.
