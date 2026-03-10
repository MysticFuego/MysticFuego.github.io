# App Schema

```mermaid
erDiagram
  GAME1_ENTITY ||--o{ GAME1_PROGRESS : tracked_by
  GAME2_ENTITY ||--o{ GAME2_PROGRESS : tracked_by

  GAME1_ENTITY {
    string id
    string name
    string category
    string description
  }

  GAME1_PROGRESS {
    string entityId
    boolean collected
    boolean favorite
    number level
    string notes
  }

  GAME2_ENTITY {
    string id
    string name
    string category
    string description
  }

  GAME2_PROGRESS {
    string entityId
    boolean collected
    boolean favorite
    number level
    string notes
  }