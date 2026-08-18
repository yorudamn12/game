# Black Box Bazaar — Credential Storage Contract

## 1. Purpose

This document defines how team authentication credentials are stored and verified.

Team credentials are sensitive authentication data and must be separated from normal team and game data.

The frontend must never directly access team credentials.

---

## 2. Credential Separation

Normal team information is stored in:

    teams/{teamId}

Authentication credential information is stored separately in:

    teamCredentials/{teamId}

Example:

    teams/TEAM-01

    teamCredentials/TEAM-01

The `teams/{teamId}` document must NOT contain a readable Team PIN.

---

## 3. Team Credential Document

Each team may have one protected credential document.

Conceptually:

    teamCredentials/{teamId}

Example structure:

    {
      teamId: "TEAM-01",
      pinHash: "<hashed-pin>",
      active: true
    }

The credential document must NOT contain the plaintext Team PIN.

The PIN must never be stored as:

    {
      teamPin: "1234"
    }

or any other plaintext representation.

---

## 4. PIN Storage

Team PINs must be stored only in a secure, non-reversible form suitable for password/PIN verification.

The backend must verify the submitted PIN against the stored PIN hash.

The plaintext PIN must never be:

- Stored in Firestore.
- Returned to the frontend.
- Included in API responses.
- Logged.
- Stored in frontend source code.
- Stored in localStorage.
- Stored in sessionStorage.
- Included in normal team documents.
- Included in leaderboard data.
- Included in activity logs.

---

## 5. Credential Access

Only trusted backend logic may access:

    teamCredentials/{teamId}

The React frontend must never directly read or write this collection.

Firestore Security Rules must deny client access:

    match /teamCredentials/{teamId} {
      allow read, write: if false;
    }

Trusted backend code using the Firebase Admin SDK may access the collection when performing authentication.

---

## 6. Authentication Lookup

When a player submits:

    Team Number + Team PIN

the trusted backend must:

1. Determine the corresponding `teamId`.
2. Retrieve the protected credential record.
3. Check whether the team is active.
4. Verify the submitted PIN against the stored PIN hash.
5. Reject the authentication attempt if verification fails.
6. Create or retrieve the Firebase Authentication user.
7. Associate the Firebase Auth identity with the team.
8. Create a Firebase custom token containing the required authorization identity.
9. Return the custom token to the client.

The client then signs in using Firebase Authentication.

---

## 7. Firebase Authentication Identity

After successful authentication, the Firebase Auth identity should contain the team association.

Example custom claim:

    {
      teamId: "TEAM-01"
    }

Firestore Security Rules may then use:

    request.auth.token.teamId

to determine which team the authenticated player belongs to.

The client must not be allowed to choose or modify this claim.

Only trusted backend/Admin SDK logic may create or update authorization claims.

---

## 8. Team Status

The credential record contains an `active` state.

Example:

    {
      teamId: "TEAM-01",
      pinHash: "<hashed-pin>",
      active: true
    }

If:

    active == false

authentication must fail even if the submitted PIN is correct.

This allows a team account to be disabled without deleting the team or its game data.

---

## 9. Authentication Failure

Authentication must fail when:

- The team number does not exist.
- The credential record does not exist.
- The team is inactive.
- The submitted PIN is incorrect.
- The authentication backend encounters an invalid credential state.

The backend must not expose sensitive information through error messages.

For example, the frontend should not be told whether:

- The team exists.
- The PIN was correct but the team was inactive.
- A credential document exists.

The client should receive a safe authentication failure response.

---

## 10. Credential Creation

Team credentials should be created through trusted setup/admin tooling.

Credential creation must:

1. Receive the initial Team Number and PIN through a trusted process.
2. Hash the PIN before storage.
3. Store only the resulting protected representation.
4. Associate the credential with the correct `teamId`.
5. Never store the plaintext PIN in Firestore.

Credential setup must not be performed by the normal player frontend.

---

## 11. Credential Updates

Players must NOT change their Team PIN directly.

PIN changes, resets, or administrative credential operations must be performed through trusted backend/admin logic.

When a PIN is changed:

- The old credential must no longer authenticate.
- The new PIN must be securely hashed before storage.
- The plaintext PIN must not be persisted.
- The operation should be logged without logging the PIN itself.

---

## 12. Credential Deletion

Credential records should normally not be deleted when a team becomes inactive.

Instead, use:

    active: false

This preserves the team's identity and game history while preventing authentication.

Permanent credential deletion should only be performed through controlled administrative procedures.

---

## 13. Logging Rules

Authentication logs may contain safe operational information such as:

- `teamId`
- authentication success/failure
- timestamp
- operation type

Authentication logs must NEVER contain:

- Team PIN.
- PIN hash.
- Authentication tokens.
- Firebase custom tokens.
- Passwords.
- Credential secrets.

Example safe log:

    {
      teamId: "TEAM-01",
      event: "LOGIN_SUCCESS",
      timestamp: "<server timestamp>"
    }

---

## 14. Security Boundary

The authentication architecture is:

    React Client
          ↓
    Team Number + PIN
          ↓
    Trusted Backend
          ↓
    teamCredentials/{teamId}
          ↓
    Verify PIN
          ↓
    Firebase Authentication
          ↓
    Firebase Auth UID + teamId claim
          ↓
    Firestore Security Rules
          ↓
    Permitted Firestore access

The frontend is never trusted with credential verification.

The frontend is never trusted to assign its own team identity.

The frontend is never trusted to modify authorization claims.

---

## 15. Core Security Principle

Team credentials are authentication secrets.

Normal team/game data and authentication credentials must remain separate.

The system must follow:

    Public/permitted game data
            ≠
    Authentication credentials

Only trusted backend logic may cross the authentication boundary.