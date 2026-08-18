# Black Box Bazaar — Authentication Contract

## 1. Authentication Model

Players authenticate using:

- Team Number
- Team PIN

The frontend must NOT directly query Firestore to validate team credentials.

Authentication must be handled through trusted backend logic.

The Team PIN must never be stored as a normal readable field in:

    teams/{teamId}

The frontend must never receive the stored/verified PIN.

---

## 2. Authentication Flow

Player enters:

    Team Number + Team PIN

        ↓

Trusted authentication function

        ↓

Verify team credentials using protected backend credential data

        ↓

Create Firebase Authentication session/custom token

        ↓

Authenticated player receives Firebase Auth identity

        ↓

Firebase Auth identity is associated with teamId

        ↓

Player can access permitted Firestore data

The Firebase Authentication identity must contain or be associated with the player's team identity.

The preferred authorization identity is:

    request.auth.token.teamId

Example:

    request.auth.token.teamId == "TEAM-01"

This allows Firestore Security Rules to determine which team the authenticated user belongs to without trusting a teamId supplied by the frontend.

---

## 3. Team Identity

Each authenticated player is associated with exactly one team.

Conceptually:

    Firebase Auth UID
            ↓
         teamId
            ↓
    teams/{teamId}

Example:

    Auth UID:
    abc123

    teamId:
    TEAM-01

    Firestore:
    teams/TEAM-01

The team association must be established by trusted authentication/backend logic.

Players must NOT be able to choose or change their own teamId after authentication.

---

## 4. Team PIN

The team PIN is used only during authentication.

The PIN must:

- Never be returned to the frontend after authentication.
- Never be displayed in the team dashboard.
- Never be included in normal team queries.
- Never be exposed through public leaderboard data.
- Never be logged in activity logs.
- Never be stored as a normal readable field in `teams/{teamId}`.
- Never be directly compared by frontend code against a Firestore document.

PIN verification must occur in trusted backend logic.

The backend may use protected credential storage appropriate for the authentication implementation.

The exact credential-storage mechanism is a backend implementation detail and must not be exposed to players.

---

## 5. Authentication Result

After successful authentication, the frontend should be able to determine:

- authenticated Firebase UID
- teamId
- teamNumber
- teamName
- the team's currently owned cards

The PIN must NOT be returned.

Example:

```js
{
  uid: "abc123",
  teamId: "TEAM-01",
  teamNumber: 1,
  teamName: "Code Warriors",
  ownedCards: [
    { id: "A1", cardId: "A1", title: "Next in Line", tier: "1", currentOwner: "TEAM-01", ... }
  ]
}
```

`ownedCards` is queried by `cards.currentOwner == teamId` at login time (see docs/DATABASE.md #5, #24 `getOwnedCards(teamId)`). Every field on a `cards/{cardId}` document is player-safe by construction — the protected answer, hidden rule, and explanation live only in `answerKeys/{cardId}` (docs/DATABASE.md #6) and are never read or returned by `loginTeam`.