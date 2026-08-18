# Black Box Bazaar — Backend Architecture Contract

## 1. Purpose

This document defines the architecture, responsibilities, security boundaries, and implementation rules for the Black Box Bazaar trusted backend.

The backend is responsible for operations that must not be trusted to the React client.

The backend works together with:

- Firebase Authentication
- Firebase Cloud Functions
- Firebase Admin SDK
- Cloud Firestore
- Firestore Security Rules

The React frontend is considered untrusted.

---

## 2. Backend Responsibilities

The trusted backend is responsible for:

- Team authentication.
- Team credential verification.
- Firebase Authentication user management.
- Firebase custom token creation.
- Firebase Auth custom claims.
- Authorization-sensitive game operations.
- Game-rule validation.
- Protected Firestore writes.
- Protected Firestore reads that cannot safely be performed by the client.
- Administrative operations.
- Authentication and important administrative audit logging.

The backend must enforce game rules independently of the frontend.

The frontend may request an operation.

The backend decides whether the operation is valid.

---

## 3. Frontend Responsibilities

The React frontend is responsible for:

- Displaying the user interface.
- Collecting Team Number and Team PIN.
- Calling trusted backend functions.
- Signing into Firebase Authentication using the returned custom token.
- Displaying permitted team information.
- Displaying permitted cards.
- Displaying permitted marketplace information.
- Displaying the leaderboard.
- Sending permitted player actions to backend functions.
- Handling loading states.
- Handling safe authentication and operation errors.

The frontend must never be treated as a trusted source of game state.

The frontend must never be allowed to decide:

- Team identity.
- Score.
- BitBucks.
- Card ownership.
- Game phase.
- Trade validity.
- Answer correctness.
- Administrative permissions.

---

## 4. Trusted Backend Boundary

The trusted boundary is:

    React Client
          |
          | Request
          v
    Cloud Function
          |
          | Validate request
          v
    Backend game logic
          |
          | Admin SDK
          v
    Firestore / Firebase Auth

The backend must validate all important state transitions before changing Firestore data.

The client must not be able to bypass backend validation by directly modifying Firestore.

---

## 5. Cloud Functions

Backend operations should be implemented as Firebase Cloud Functions.

Functions should use the Firebase Admin SDK for trusted server-side access.

Functions should be organized by responsibility rather than placing all game logic into one large file.

Initial structure:

    functions/
    ├── package.json
    ├── index.js
    ├── src/
    │   ├── config.js
    │   ├── auth/
    │   │   ├── loginTeam.js
    │   │   └── claims.js
    │   ├── credentials/
    │   │   └── verifyPin.js
    │   └── teams/
    │       └── getTeam.js
    └── .gitignore

Additional modules may be added as later game features are implemented.

---

## 6. Authentication Entry Point

The initial authentication operation is:

    loginTeam

The player provides:

    teamNumber
    teamPin

The React frontend sends these values to the trusted backend.

The backend must:

1. Validate the input.
2. Resolve the team.
3. Retrieve the protected credential record.
4. Verify the submitted PIN.
5. Check that the team is active.
6. Create or retrieve the Firebase Authentication user.
7. Associate the Firebase Auth identity with the team.
8. Set the required authorization identity.
9. Create a Firebase custom token.
10. Return only the information required by the client.

The backend must never return the stored PIN or PIN hash.

---

## 7. Authentication Identity

Each authenticated player is associated with exactly one team.

The identity relationship is:

    Firebase Auth UID
          |
          v
        teamId
          |
          v
    teams/{teamId}

The Firebase Auth identity should contain the team association through trusted authorization claims.

Example:

    teamId: "TEAM-01"

The client must not be allowed to assign or modify its own `teamId` claim.

---

## 8. Team Credentials

Authentication credentials are stored separately from normal team data.

Normal team data:

    teams/{teamId}

Protected credentials:

    teamCredentials/{teamId}

A credential document conceptually contains:

    teamId
    pinHash
    active

The plaintext Team PIN must never be stored in Firestore.

The plaintext PIN must never be returned to the frontend.

The plaintext PIN must never be logged.

The React frontend must never directly access `teamCredentials`.

---

## 9. PIN Verification

The backend must verify the submitted Team PIN against the securely stored PIN hash.

The backend must never perform a simple plaintext comparison against a Firestore field.

The backend must never store the submitted PIN for later use.

The backend must never expose the stored hash to the client.

Authentication failures must use safe error messages that do not reveal whether a team exists or which credential check failed.

---

## 10. Firebase Authentication

The application uses Firebase Authentication as the authenticated identity layer.

The Team Number + Team PIN login mechanism is implemented through trusted backend logic rather than relying on a native Firebase sign-in provider.

After successful credential verification, the backend creates a Firebase custom token.

The React frontend then signs into Firebase Authentication using that custom token.

The resulting Firebase Auth session is used for authenticated Firestore access and authorization.

---

## 11. Firestore Authorization

Firestore Security Rules determine whether an authenticated client is allowed to perform a direct Firestore operation.

Rules may use the authenticated user's Firebase Auth information, including the team identity claim.

Conceptually:

    request.auth.token.teamId

The client must not be able to modify the values used by Security Rules to establish its identity.

Security Rules must continue to deny unauthorized direct client writes even if a malicious user modifies the frontend application.

---

## 12. Admin SDK Access

Trusted backend functions use the Firebase Admin SDK for privileged operations.

Admin SDK access is trusted and therefore bypasses normal Firestore Security Rules.

Because of this, backend functions must perform their own authorization and game-rule validation before performing privileged operations.

The backend must never assume that Admin SDK access automatically makes an operation valid.

Every protected operation must validate:

- Authentication state.
- Team identity.
- Relevant game state.
- Ownership.
- Permissions.
- Operation-specific rules.

---

## 13. Game State Validation

The backend is responsible for enforcing important game rules.

Examples include:

- Whether the current game phase permits an operation.
- Whether a team owns a card.
- Whether a card can be submitted.
- Whether a trade is valid.
- Whether a marketplace action is valid.
- Whether a score adjustment is authorized.
- Whether BitBucks may be changed.
- Whether an answer may be submitted.
- Whether an administrative action is permitted.

The frontend may disable buttons based on game state for usability, but this is not a security mechanism.

The backend must independently validate the operation.

---

## 14. Protected Game Data

The following data must not be directly modifiable by players:

- Team score.
- Team BitBucks.
- Card ownership.
- Card answer keys.
- Game phase.
- Other team identities.
- Other team's protected data.
- Trade completion state.
- Administrative state.

Players must request protected operations through trusted backend functions.

The backend performs validation and applies the resulting Firestore transaction or write.

---

## 15. Answer Keys

Answer keys are protected game data.

Players must never receive answer keys before they are legitimately revealed by the game rules.

Answer keys must not be included in normal card queries sent to the player.

The frontend must not contain answer keys in source code.

Backend functions must determine whether an answer may be revealed.

---

## 16. Team Data

Team documents are stored under:

    teams/{teamId}

Team documents contain normal game information such as:

- Team number.
- Team name.
- Score.
- BitBucks.
- Creation timestamp.
- Other approved game-state fields.

Authentication credentials do not belong in this document.

Sensitive credential information must remain in:

    teamCredentials/{teamId}

---

## 17. Team Authentication Response

After successful authentication, the backend should provide only safe authentication information.

Conceptually:

    {
      uid: "firebase-auth-uid",
      teamId: "TEAM-01",
      teamNumber: 1,
      teamName: "Code Warriors",
      customToken: "<firebase-custom-token>"
    }

The response must NOT contain:

- Team PIN.
- PIN hash.
- Other team's information.
- Internal credential data.
- Administrative secrets.

The Firebase custom token is sensitive and must only be returned as required for the authentication flow.

---

## 18. Authentication Failure

Authentication must fail when:

- Team Number is missing.
- Team PIN is missing.
- Team Number has an invalid format.
- The team does not exist.
- The credential record does not exist.
- The team is inactive.
- The PIN is incorrect.
- The backend encounters an invalid credential state.

The frontend should receive a safe generic authentication failure.

The response must not reveal sensitive internal information.

For example, do not return:

    "Team exists but PIN is incorrect."

Prefer a safe message such as:

    "Invalid team credentials."

---

## 19. Error Handling

Backend functions must return predictable and safe errors.

Errors should distinguish between:

- Invalid client input.
- Unauthenticated requests.
- Unauthorized operations.
- Invalid game state.
- Invalid ownership.
- Failed credential verification.
- Internal server errors.

Internal implementation details must not be exposed to players.

Stack traces, database errors, credential information, tokens, and secrets must never be returned to the frontend.

---

## 20. Idempotency and Transactions

Operations that modify important game state should use Firestore transactions or other appropriate atomic mechanisms when multiple pieces of state must remain consistent.

Examples:

- Completing a trade.
- Changing card ownership.
- Deducting and adding BitBucks.
- Updating score based on a validated submission.

A protected operation must not leave the database in a partially updated state.

Where appropriate, the backend should verify the current state again inside the transaction before applying changes.

---

## 21. Audit Logging

Important administrative and game-sensitive operations should produce audit records.

Examples include:

- Successful authentication.
- Failed authentication.
- Administrative score changes.
- Administrative BitBuck changes.
- Game-phase changes.
- Answer reveals.
- Trade reversals.
- Other privileged operations.

Audit logs must never contain:

- Team PIN.
- PIN hash.
- Authentication tokens.
- Firebase custom tokens.
- Other credential secrets.

Logs should contain only the operational information required for auditing.

---

## 22. Authentication Session

After successful authentication, the Firebase Authentication session is managed by Firebase Authentication.

Refreshing the browser should not require the player to enter the Team Number and PIN again while the Firebase session remains valid.

Logging out must terminate the client authentication session.

The backend must continue to trust Firebase Authentication identity rather than any team identifier supplied directly by the client.

---

## 23. Authorization Rule

A request is not authorized merely because the client sends a valid `teamId`.

The backend must derive the authenticated team identity from the trusted Firebase Authentication context.

For authenticated operations, the backend should use the authenticated identity and its trusted team association.

A client-supplied team identifier must never override the authenticated identity.

---

## 24. Admin Operations

Administrative operations use a separate authorization path.

Admin users must be authenticated through Firebase Authentication and receive the appropriate trusted admin authorization claim.

Admin operations may include:

- Managing teams.
- Changing game phase.
- Revealing answers.
- Inspecting submissions.
- Inspecting trades.
- Reversing trades.
- Controlled score adjustments.
- Controlled BitBuck adjustments.

Admin operations must be protected by backend authorization checks and should be audit logged.

---

## 25. Secrets and Environment Configuration

Secrets must not be hard-coded into the React frontend.

Secrets must not be committed to Git.

Secrets must not be placed in Firestore documents accessible to players.

Backend configuration and secrets must use the appropriate Firebase/Google Cloud configuration mechanism.

The frontend may contain Firebase client configuration values intended for client initialization, but must never contain Firebase Admin credentials or other server secrets.

---

## 26. Client-to-Backend Contract

The frontend communicates with backend functions using explicitly defined request and response contracts.

A backend function must validate the request structure before performing any database operation.

The backend must not depend on frontend validation alone.

Example login request:

    {
      teamNumber: 1,
      teamPin: "1234"
    }

The Team PIN exists only for the duration required to authenticate the request and must not be persisted or logged.

---

## 27. Database Access Boundary

The backend may access protected collections using the Admin SDK when required by a trusted operation.

The React frontend should directly read only data that Firestore Security Rules explicitly permit.

Protected operations should follow:

    React
      ↓
    Callable Function
      ↓
    Validate authentication
      ↓
    Validate game rules
      ↓
    Firestore transaction/write
      ↓
    Safe response

The client must never receive unrestricted database access.

---

## 28. Initial Backend Scope

The first backend implementation phase is limited to authentication infrastructure.

Initial implementation should cover:

- Cloud Functions project setup.
- Firebase Admin SDK initialization.
- Team credential verification.
- Team login function.
- Firebase Auth user creation/retrieval.
- Firebase custom token creation.
- Team identity claim.
- Safe authentication responses.
- Safe authentication errors.

The first implementation must NOT attempt to implement the entire game backend.

---

## 29. Deferred Backend Features

The following features will be implemented after authentication is stable:

- Card ownership operations.
- Answer submission.
- Score calculation.
- BitBucks transactions.
- Marketplace operations.
- Trade operations.
- Game-phase management.
- Leaderboard calculations.
- Admin operations.
- Audit workflows.

Each feature should have its own validation and backend contract before implementation.

---

## 30. Implementation Principles

Backend implementation must follow these principles:

1. The frontend is untrusted.
2. Authentication and authorization are separate concepts.
3. Team credentials are separate from team game data.
4. Plaintext PINs are never persisted.
5. Authorization identity comes from trusted Firebase Authentication state.
6. Important game rules are enforced on the backend.
7. Admin SDK access does not replace authorization validation.
8. Protected state changes should be atomic.
9. Sensitive information must never be logged or returned.
10. Firestore Security Rules remain an additional client-access boundary.
11. Backend functions should have narrow, well-defined responsibilities.
12. The backend should not contain unnecessary frontend/UI logic.
13. Game features should be implemented incrementally.
14. Existing architecture documents must remain the source of truth for the corresponding contracts.
15. Claude or any coding agent must not introduce a different authentication or database architecture without explicitly updating the architecture documents first.

---

## 31. Source-of-Truth Documents

The backend implementation must remain consistent with:

    docs/DATABASE.md

    docs/AUTHENTICATION.md

    docs/CREDENTIALS.md

    docs/BACKEND.md

These documents define the intended architecture.

If implementation requirements conflict with these documents, the conflict must be resolved before changing the implementation.

---

## 32. Definition of Done for Backend Phase 1

Backend Phase 1 is complete when:

- Cloud Functions are initialized.
- Firebase Admin SDK is initialized correctly.
- The backend can securely access Firestore.
- Team credentials can be securely verified.
- A valid Team Number + PIN can authenticate.
- An invalid Team Number + PIN is rejected.
- Inactive teams are rejected.
- Firebase Auth users are created or retrieved correctly.
- The authenticated identity is associated with the correct `teamId`.
- A Firebase custom token can be generated.
- The React client can sign in using the custom token.
- No plaintext PIN is stored.
- No credential secrets are logged.
- No credential documents are readable by the player client.
- Firestore Security Rules continue to protect client access.
- The implementation matches `DATABASE.md`, `AUTHENTICATION.md`, and `CREDENTIALS.md`.
- The implementation is committed to the Person A backend branch.

---

## 33. Core Backend Principle

The Black Box Bazaar backend follows one central rule:

    The client may request.
    The backend must decide.
    Firestore Rules must enforce client access.
    Firebase Authentication must establish identity.

No critical game rule should depend solely on code running in the player's browser.