# Black Box Bazaar — Database Contract

## 1. Overview

Black Box Bazaar uses Firebase Cloud Firestore as the realtime database.

The database is responsible for:

- Teams
- Cards and card ownership
- Card answer keys
- BitBucks
- Marketplace listings
- Trades
- Answer submissions
- Scores
- Game state
- Activity/audit logs

The frontend must NOT be trusted to enforce game rules.

Important operations such as:

- authentication
- trades
- BitBuck transfers
- card ownership changes
- answer validation
- scoring
- game-state changes

must be handled through controlled backend/service functions and enforced by Firebase Security Rules.

The database is the source of truth for the game.


# 2. Collections

The main Firestore collections are:

- teams
- cards
- answerKeys
- listings
- trades
- submissions
- game
- activityLogs

The structure is:

    teams/{teamId}
    cards/{cardId}
    answerKeys/{cardId}
    listings/{listingId}
    trades/{tradeId}
    submissions/{submissionId}
    game/{gameId}
    activityLogs/{logId}


# 3. Teams

Collection:

    teams/{teamId}

Example:

    {
      teamNumber: 1,
      teamName: "Code Warriors",
      score: 0,
      bitBucks: 100,
      createdAt: Timestamp
    }

## Fields

| Field | Type | Description |
|---|---|---|
| teamNumber | number | Unique team number used for login |
| teamName | string | Team's display name |
| score | number | Current puzzle score |
| bitBucks | number | Current BitBuck balance |
| createdAt | timestamp | Team creation time |

## Rules

- teamNumber must be unique.
- Every team starts with 100 BitBucks.
- Every team starts with score 0.
- Players cannot directly modify their score.
- Players cannot directly modify their BitBuck balance.
- Players cannot modify another team's data.
- Team identity must be associated with the authenticated Firebase user.
- Authentication credentials must not be exposed through normal team reads.

## Canonical Team Roster

The finalized event has exactly:

    14 teams

    TEAM-01 through TEAM-14

    teamNumber 1 through 14, matching the teamId suffix

Each team receives exactly:

    4 initial cards

giving a fixed total of:

    56 cards

This roster is fixed by the finalized card dataset (see section 8, "Initial Card Allocation") and is enforced by the local seed-data validator (see section 8a, "Local Seed Input Files").


# 4. Team Authentication Data

Team authentication uses:

- Team Number
- Team PIN

The PIN is used only during authentication.

The PIN must NOT be stored as a normal readable field in the team document.

Players must not be able to query Firestore and retrieve team PINs.

Authentication should be handled through trusted backend authentication logic.

After authentication, the authenticated Firebase user must be associated with a team.

Conceptually:

    Firebase Auth UID
            ↓
         teamId
            ↓
    teams/{teamId}

Example:

    Firebase UID: abc123
    teamId: TEAM-01

The authenticated identity is then used for authorization.

The frontend must never directly compare a submitted PIN against a Firestore document.


# 5. Cards

Collection:

    cards/{cardId}

Example:

    {
      cardId: "A1",
      title: "Next in Line",
      tier: "1",
      initialOwner: "TEAM-01",
      currentOwner: "TEAM-01",
      status: "owned",
      pointsCorrect: 5,
      pointsWrong: -1,
      examples: [
        { input: "10", output: "11" },
        { input: "24", output: "29" },
        { input: "30", output: "31" }
      ],
      finalInput: "54",
      question: "Study the pattern shown by the examples, then determine the output for the final input.",
      createdAt: Timestamp
    }

## Fields

| Field | Type | Description |
|---|---|---|
| cardId | string | Unique card ID (A1-A4 … N1-N4, one letter block per team) |
| title | string | Player-visible puzzle title |
| tier | string | "1", "2", or "3" (see section 5b, "Scoring") |
| initialOwner | string | Team that originally received the card |
| currentOwner | string | Team that currently owns the card |
| status | string | owned / listed |
| pointsCorrect | number | Points awarded for a correct answer, derived from tier |
| pointsWrong | number | Points awarded/deducted for an incorrect answer, derived from tier |
| examples | array&lt;{input, output}&gt; | Player-visible input/output examples illustrating the puzzle's pattern |
| finalInput | string | The specific input the owning team must solve for |
| question | string | Player-visible prompt shown alongside the examples and finalInput |
| createdAt | timestamp | Card creation time |

`tier` uses the numeric strings "1" / "2" / "3", not the "easy / medium / hard" labels used in earlier drafts of this document. The finalized card dataset and the scoring rules in section 5b are both keyed by tier number, so tier number is the canonical representation.

`title`, `examples`, `finalInput`, and `question` are player-visible puzzle content beyond the minimal ownership/status/scoring fields shown in earlier drafts of this document. They are safe to read directly because they never include the correct answer, the hidden rule, or any solution explanation.

## Important

The card document MUST NOT contain the correct answer, the hidden rule, or the verification/explanation text.

That protected content is stored separately in:

    answerKeys/{cardId}

This separation is required so that players can read permitted card information without receiving the answer key.


# 5b. Scoring

Scoring is derived entirely from a card's tier and is fixed for the finalized event:

| Tier | pointsCorrect | pointsWrong |
|---|---:|---:|
| 1 | +5 | -1 |
| 2 | +10 | -2 |
| 3 | +15 | -5 |

Every card's `pointsCorrect` and `pointsWrong` fields are set at seed time from this table based on the card's `tier`. Backend scoring logic (not yet implemented) must apply `pointsCorrect`/`pointsWrong` from the card document rather than re-deriving them from tier at submission time, so that the source of truth for a scoring event stays on the card record itself.

This section documents the scoring *values* only. Answer validation and score-update logic are deferred backend features (see section 29) and are implemented separately.


# 6. Card Answer Keys

Collection:

    answerKeys/{cardId}

Example:

    {
      answer: "59",
      hiddenRule: "Output = the smallest prime number greater than the input.",
      explanation: "10 -> 11 (first prime above 10). 24 -> 29 (25, 26, 27, 28 are all composite). 30 -> 31. FINAL: 54 -> 55, 56, 57, 58 are composite, so the answer is 59.",
      unconfirmedRule: false
    }

## Fields

| Field | Type | Description |
|---|---|---|
| answer | string | Correct answer for the card |
| hiddenRule | string \| null | The puzzle's underlying rule; protected the same as `answer` because knowing it lets a team solve the card without playing it |
| explanation | string \| null | Worked-solution walkthrough for admin/dispute-resolution use; never sent to players |
| unconfirmedRule | boolean | Present and `true` only for cards whose hidden rule the puzzle setters could not fully confirm from the printed examples (see section 8a) |

## Security

Answer keys, hidden rules, and explanations are protected data.

Players must NOT be able to read answerKeys.

Players must NOT be able to modify answerKeys.

Only trusted backend logic and authorized administrators may access answer keys.

The frontend must never receive the correct answer, the hidden rule, or the explanation before the appropriate reveal stage.

Answer validation must happen through trusted backend logic.


# 7. Card Ownership

Cards always maintain two ownership values:

    initialOwner
    currentOwner

Example:

Initial:

    cardId: A1
    initialOwner: TEAM-01
    currentOwner: TEAM-01

After sale:

    cardId: A1
    initialOwner: TEAM-01
    currentOwner: TEAM-04

`initialOwner` is the historical record of which team originally received the card at seed time; it NEVER changes after seeding.

`currentOwner` is the single authoritative source of who owns the card right now. At seed time, `currentOwner` always equals `initialOwner`. The current owner changes only after a completed trade, applied by trusted backend logic.

Normal clients (players) must not be able to arbitrarily change `currentOwner` through a direct Firestore write. Ownership changes must only happen through the atomic trade-completion transaction described in section 12.

Players do not register cards manually.

Initial card allocations are configured before the event.


# 8. Initial Card Allocation

Each team receives exactly four initial cards.

The four cards represent the configured set assigned to that team, using one letter block per team (A for TEAM-01 through N for TEAM-14):

Example:

    TEAM-01

    A1
    A2
    A3
    A4

    TEAM-02

    B1
    B2
    B3
    B4

    ...

    TEAM-14

    N1
    N2
    N3
    N4

14 teams x 4 cards each gives a fixed total of 56 cards.

Players do not choose their initial cards.

Players do not register their cards.

Initial ownership is created automatically through the database seed/setup process.


# 8a. Local Seed Input Files

Before cards and answerKeys are written to Firestore, the finalized card dataset lives as two local, gitignored JSON files under `functions/seed-data/`:

    functions/seed-data/event.local.json
    functions/seed-data/answers.local.json

`event.local.json` contains the player-visible team/card seed data described in sections 3, 5, and 5b (teams, cardIds, tier, examples, finalInput, question, pointsCorrect/pointsWrong). `answers.local.json` contains the protected answer-key data described in section 6 (answer, hiddenRule, explanation, unconfirmedRule), keyed by cardId.

These two files are the *inputs* to the Firestore seed script (see "Firestore Seed Script" below), not Firestore documents themselves. They must never be committed to git — `functions/.gitignore` excludes both by name.

## Validation

`functions/src/seedData/validateSeedData.js` enforces the structural rules that must hold before this data can seed Firestore:

- Exactly 14 teams.
- Exactly 56 cards.
- Exactly 4 cards per team.
- No duplicate card IDs.
- Every card has exactly one `initialOwner`.
- Every card has a corresponding entry in the answers file with a non-empty `answer`.
- Every card's `tier` is "1", "2", or "3".

Run it with:

    npm run validate:seed

## Cards With an Unconfirmed Hidden Rule

Four cards carry `unconfirmedRule: true` in `answers.local.json` because the source card dataset itself flagged their hidden rule as unable to be confirmed from the printed examples:

| cardId | Team | Note |
|---|---|---|
| F3 | TEAM-06 | Hidden rule and answer are self-consistent with the given examples, but never independently confirmed by the puzzle setters. |
| N3 | TEAM-14 | Reuses F3's puzzle; same unconfirmed-rule status. |
| H4 | TEAM-08 | Hidden rule and answer are self-consistent with the given examples, but the verification/explanation was left blank by the puzzle setters. |
| N4 | TEAM-14 | Reuses H4's puzzle; hidden rule and explanation are both blank in the source dataset. |

These four cards pass structural validation (each has a `tier`, an `initialOwner`, and a non-empty `answer`), so `npm run validate:seed` reports them as informational flags rather than errors. They must be resolved or explicitly accepted by an event organizer before the event goes live, since scoring against an unconfirmed rule risks an incorrect answer key.

## Firestore Seed Script

`functions/src/seedData/seedEventData.js` (orchestration) and `functions/scripts/seedEventData.js` (dev/admin-only CLI entrypoint, run via `npm run seed:event`) write the validated seed data to Firestore: 14 team documents, 56 card documents, 56 answerKeys documents, and the initial `game/main` document. It is never wired to a callable Cloud Function, so it has no path reachable by players.

Two values are decided by the seed script itself because the finalized card dataset does not supply them:

- **`teamName`** — the card dataset has no per-team display names, so the seed script generates a placeholder of the form `"Team 01"` … `"Team 14"` (zero-padded `teamNumber`). Real display names can be applied later through a separate trusted admin update; the seed script does not block on this.
- **`game/{gameId}` document ID and initial values** — this document's ID and its seed-time `phase`/`isActive` values are not specified anywhere else in this document. The seed script uses `game/main`, `phase: "CHECK_IN"`, `isActive: true`. Any future game-phase logic should treat `game/main` as the single canonical game-state document for this event.

Idempotency: the script reads `game/main` before writing anything. If it already exists, the script aborts with no writes (`AlreadySeededError`) rather than overwriting live score/BitBuck/ownership state with the original seed values. All writes happen in a single Firestore batch, so a failure partway through never leaves the collections partially seeded.


# 9. Marketplace Listings

Collection:

    listings/{listingId}

Example:

    {
      listingId: "LIST-001",
      cardId: "M07",
      sellerId: "TEAM-01",
      price: 50,
      status: "active",
      createdAt: Timestamp
    }

## Fields

| Field | Type | Description |
|---|---|---|
| listingId | string | Unique marketplace listing ID |
| cardId | string | Card being listed |
| sellerId | string | Team selling the card |
| price | number | Asking price in BitBucks |
| status | string | active / sold / cancelled |
| createdAt | timestamp | Listing creation time |

## Listing Rules

A team may list a card only if:

- The team currently owns the card.
- The card is not already involved in an active trade.
- The game phase permits trading.
- The requested price is valid.

When a card is listed:

    cards/{cardId}.status = "listed"

The card's ownership does NOT change.

When the listing is completed or cancelled:

    cards/{cardId}.status = "owned"

A card may have only one active listing at a time.

Players cannot directly mark a listing as sold.


# 10. Trades

Collection:

    trades/{tradeId}

Example:

    {
      cardId: "M07",
      sellerId: "TEAM-01",
      buyerId: "TEAM-04",
      price: 50,
      sellerConfirmed: true,
      buyerConfirmed: true,
      status: "completed",
      createdAt: Timestamp,
      completedAt: Timestamp
    }

## Fields

| Field | Type | Description |
|---|---|---|
| cardId | string | Card being traded |
| sellerId | string | Current card owner/seller |
| buyerId | string | Team attempting to buy |
| price | number | Agreed BitBuck price |
| sellerConfirmed | boolean | Seller confirmation |
| buyerConfirmed | boolean | Buyer confirmation |
| status | string | pending / completed / cancelled / reversed |
| createdAt | timestamp | Trade creation time |
| completedAt | timestamp | Completion time |


# 11. Trade Confirmation

A trade is completed ONLY when:

    sellerConfirmed == true

AND

    buyerConfirmed == true

Before both confirmations:

- Card ownership does not change.
- BitBucks do not change.
- Listing remains associated with the trade.
- Trade remains pending.

The frontend must NOT be able to directly mark a trade as completed.


# 12. Atomic Trade Completion

When both parties confirm, trusted backend logic must validate:

1. Seller still owns the card.
2. Card is still listed.
3. Buyer and seller are different teams.
4. Buyer has enough BitBucks.
5. Trade is still pending.
6. Both confirmations are true.
7. The listing is still active.
8. The game phase permits trading.

If all checks pass, the operation must be performed atomically.

The transaction must:

1. Deduct the price from the buyer.
2. Add the price to the seller.
3. Change card.currentOwner to buyer.
4. Change card.status to owned.
5. Mark the listing as sold/inactive.
6. Mark the trade as completed.
7. Record completedAt.
8. Create an activity log.

If any validation fails:

    NO partial changes are allowed.

Example:

    Buyer: 100 BB
    Seller: 100 BB
    Card: M07
    Price: 50 BB

After successful completion:

    Buyer: 50 BB
    Seller: 150 BB
    M07.currentOwner: TEAM-04


# 13. Trade Cancellation

A pending trade may be cancelled if permitted by the game rules.

When cancelled:

- No BitBucks are transferred.
- Card ownership does not change.
- The trade becomes cancelled.
- The listing becomes available again if appropriate.
- An activity log is created.


# 14. Trade Reversal

Trade reversal is an ADMIN-ONLY operation.

A reversal may be used to correct an administrative/game error.

A reversal must:

- Be performed through trusted backend logic.
- Record the administrator performing the action.
- Record a reason.
- Correct BitBuck balances.
- Correct card ownership if necessary.
- Update the trade status to reversed.
- Create an activity log.

Example:

    {
      type: "TRADE_REVERSED",
      tradeId: "TRADE-001",
      actorId: "ADMIN-01",
      reason: "Administrative correction",
      createdAt: Timestamp
    }


# 15. Answer Submissions

Collection:

    submissions/{submissionId}

Example:

    {
      cardId: "M07",
      teamId: "TEAM-04",
      ownershipInstanceId: "M07-TEAM-04-001",
      answer: "1010",
      confidence: "high",
      status: "pending",
      submittedAt: Timestamp
    }

## Fields

| Field | Type | Description |
|---|---|---|
| cardId | string | Card being solved |
| teamId | string | Team submitting the answer |
| ownershipInstanceId | string | Unique ownership period for this team/card |
| answer | string | Submitted answer |
| confidence | string | low / medium / high |
| status | string | pending / correct / incorrect |
| submittedAt | timestamp | Submission time |


# 16. Submission Rules

Only the current card owner may submit an answer.

A submission must be validated by trusted backend logic.

The backend must verify:

- User is authenticated.
- User belongs to the submitting team.
- Team currently owns the card.
- Game phase permits submissions.
- This team has not already submitted for the current ownership period.
- The card is eligible for submission.

Once submitted:

- The answer cannot be edited.
- The submission cannot be deleted by the player.
- The player cannot submit again for the same ownership instance.

The correct answer must not be returned to the player.


# 17. Ownership Instance

A card may change owners during the game.

Example:

    M07
    TEAM-01 owns it
        ↓
    TEAM-01 submits
        ↓
    TEAM-01 sells it
        ↓
    TEAM-04 buys it
        ↓
    TEAM-04 may submit

Therefore, submission uniqueness is based on:

    cardId + ownershipInstanceId

rather than cardId alone.

Example:

    M07-TEAM-01-001
    M07-TEAM-04-001

This allows each new owner to receive their own submission opportunity while preventing duplicate submissions by the same owner during the same ownership period.

## Current Implementation

`functions/src/submissions/submitAnswer.js` implements `ownershipInstanceId` as `${cardId}-${currentOwner}-001`, computed live from the card's current owner rather than tracked with an incrementing per-card counter, because trading (and therefore ownership history) is not implemented yet. This is correct for a card's first ownership period per team. It does NOT yet handle a team re-acquiring a card it previously owned and already submitted for — that recomputes the same `-001` instance ID as their first period, so a resubmission attempt is treated as an already-submitted duplicate rather than being granted a fresh `-002` opportunity. This fails safe (blocks a resubmission) rather than failing open, and does not lose or duplicate score. If re-acquisition needs to grant a new submission opportunity, whichever trade-completion logic changes `cards/{cardId}.currentOwner` will need to also maintain an explicit per-card ownership counter, and `submitAnswer` will need to read that counter instead of hardcoding `001`.


# 18. Answer Validation and Scoring

The frontend must NOT determine whether an answer is correct.

Trusted backend logic compares:

    submitted answer

against:

    answerKeys/{cardId}

The result is then recorded on the submission.

For a correct answer:

    team.score += pointsCorrect

For an incorrect answer:

    team.score += pointsWrong

Example:

    pointsCorrect = 10
    pointsWrong = -5

Correct:

    +10 points

Incorrect:

    -5 points

The score update must be performed through trusted backend logic.

Players cannot directly modify score.

## Current Implementation

`functions/src/submissions/submitAnswer.js` (exposed as the callable `submitAnswer`) implements this section: it reads `pointsCorrect`/`pointsWrong` from the card document itself (not re-derived from tier), compares the submitted answer against `answerKeys/{cardId}.answer` inside a Firestore transaction, and atomically writes the `submissions/{ownershipInstanceId}` document and increments `teams/{teamId}.score` in the same transaction. The response returned to the caller is only `{ status, pointsAwarded }` — the correct answer, hidden rule, and explanation are read from `answerKeys/{cardId}` only inside the trusted backend transaction and are never included in the response.

Game-phase gating (section 16, section 22) is intentionally not enforced yet: submission permissions are not unambiguously specified for every phase (in particular, BAZAAR's "controlled by phase rules" is not further defined anywhere in this document), so implementing it was deferred rather than guessed at. This is a known gap, not an oversight.


# 19. BitBuck Model

BitBucks are stored on the team document.

Example:

    {
      bitBucks: 100
    }

Every team begins with:

    100 BitBucks

BitBucks can change through valid marketplace transactions or authorized administrative corrections.

Example:

    TEAM-01 sells a card for 50 BB

    TEAM-01:
    100 → 150 BB

    TEAM-04 buys the card for 50 BB

    TEAM-04:
    100 → 50 BB

BitBucks do NOT directly become puzzle score.

BitBucks are used primarily as the game's trading currency and as the final tie-breaker.


# 20. Winner and Ranking

The primary ranking value is:

    Puzzle Score

BitBucks are the tie-breaker.

Teams are sorted by:

1. score descending
2. bitBucks descending

Example:

| Rank | Team | Score | BitBucks |
|---|---|---:|---:|
| 1 | Code Warriors | 80 | 45 |
| 2 | Binary Bandits | 75 | 120 |
| 3 | Bug Slayers | 75 | 90 |

Team 2 ranks above Team 3 because both have 75 points but Team 2 has more BitBucks.

A team with a higher puzzle score ALWAYS ranks above a team with a lower puzzle score, regardless of BitBuck balance.


# 21. Leaderboard

The leaderboard is derived from team data.

Sort order:

    score DESC
    bitBucks DESC

The leaderboard should update in realtime using Firestore realtime listeners.

Example:

    Team A solves a card
          ↓
    Backend updates score
          ↓
    Firestore changes
          ↓
    Leaderboard listener receives update
          ↓
    All connected clients display new ranking

No manual page refresh should be required.


# 22. Game State

Collection:

    game/{gameId}

Example:

    {
      phase: "BAZAAR",
      isActive: true,
      updatedAt: Timestamp
    }

## Possible Phases

    CHECK_IN
    BAZAAR
    SUBMISSION
    REVEAL
    GAME_OVER

The game state determines which operations are allowed.

### During BAZAAR

- Buying: allowed
- Selling: allowed
- Trading: allowed
- Answer submission: controlled by phase rules

### During SUBMISSION

- Buying: disabled if the event rules require it
- Selling: disabled if the event rules require it
- Answer submission: allowed

### During REVEAL

- Answer submissions: disabled
- Trading: disabled
- Admin answer reveal: allowed

### During GAME_OVER

- Trading: disabled
- Submissions: disabled
- Leaderboard: read-only
- Final ranking: displayed

The exact phase permissions must be enforced by backend logic and security rules rather than frontend UI alone.


# 23. Activity Logs

Collection:

    activityLogs/{logId}

Example:

    {
      type: "TRADE_COMPLETED",
      actorId: "TEAM-04",
      cardId: "M07",
      description: "TEAM-04 bought M07 from TEAM-01 for 50 BB",
      createdAt: Timestamp
    }

## Possible Activity Types

    TEAM_LOGIN
    CARD_LISTED
    TRADE_REQUESTED
    TRADE_CONFIRMED
    TRADE_COMPLETED
    TRADE_CANCELLED
    TRADE_REVERSED
    ANSWER_SUBMITTED
    ANSWER_REVEALED
    SCORE_UPDATED
    GAME_PHASE_CHANGED
    ADMIN_ACTION

Activity logs are primarily for:

- Admin monitoring
- Debugging
- Troubleshooting
- Game auditing

Players do not need access to the complete audit log.

Activity logs should be append-only from the player's perspective.


# 24. Player-Facing Backend Services

The player UI should interact with controlled service functions rather than directly modifying protected Firestore fields.

Examples:

    authenticateTeam(teamNumber, teamPin)

    getCurrentTeam()

    getOwnedCards(teamId)

    getMarketplaceListings()

    createListing(teamId, cardId, price)

    cancelListing(teamId, listingId)

    requestPurchase(buyerId, listingId)

    confirmTrade(tradeId, teamId)

    cancelTrade(tradeId, teamId)

    submitAnswer(teamId, cardId, answer, confidence)

    getLeaderboard()

    getGameState()

These functions must validate authorization and game rules.

## Implementation Status

- `authenticateTeam` — implemented as the `loginTeam` callable. Its response also includes `ownedCards` (see docs/AUTHENTICATION.md #5), so most clients will not need a separate `getOwnedCards` call immediately after login.
- `getOwnedCards(teamId)` — implemented as `functions/src/teams/getOwnedCards.js`, used internally by `loginTeam`. Not yet exposed as its own callable Cloud Function; add one only when a client needs to refresh owned cards without re-authenticating.
- `submitAnswer(cardId, answer, confidence)` — implemented as the `submitAnswer` callable (`functions/src/submissions/submitAnswer.js`). The team identity comes from the authenticated `teamId` claim, never from a client-supplied value, so the exposed signature is `submitAnswer({ cardId, answer, confidence })` rather than taking `teamId` as a parameter.
- `getCurrentTeam()`, `getMarketplaceListings()`, `createListing`, `cancelListing`, `requestPurchase`, `confirmTrade`, `cancelTrade`, `getLeaderboard()`, `getGameState()` — not implemented yet.


# 25. Admin Services

Admin services may include:

    getAllTeams()

    getAllCards()

    getAllListings()

    getAllTrades()

    getAllSubmissions()

    revealAnswer(cardId)

    calculateScores(cardId)

    changeGamePhase(phase)

    cancelTrade(tradeId)

    reverseTrade(tradeId, reason)

    getActivityLogs()

Admin-only operations must be protected by Firebase Authentication and admin authorization.


# 26. Security Principles

The frontend is NOT trusted.

Players must NOT be able to:

- Change their score.
- Change their BitBucks.
- Change card ownership.
- Change initial card allocations.
- Change another team's data.
- Read answer keys.
- Modify answer keys.
- Submit for another team.
- Submit twice for the same ownership instance.
- Directly complete a trade.
- Bypass buyer/seller confirmation.
- Change game phase.
- Modify activity logs.
- Modify another team's marketplace listing.
- Change card point values.
- Change card answers.

Players may only perform operations explicitly permitted by the backend and security rules.


# 27. Backend Validation

Every important game operation must be validated server-side.

## Listing a Card

Backend verifies:

- User is authenticated.
- User belongs to seller team.
- Seller currently owns card.
- Card is not already listed.
- Game phase permits listing.
- Price is valid.

## Buying a Card

Backend verifies:

- User is authenticated.
- Buyer is not the seller.
- Listing is active.
- Seller still owns card.
- Buyer has sufficient BitBucks.
- Game phase permits trading.

## Confirming a Trade

Backend verifies:

- User belongs to buyer or seller team.
- Trade is pending.
- User is authorized to confirm that side.

## Submitting an Answer

Backend verifies:

- User is authenticated.
- User belongs to the submitting team.
- Team currently owns the card.
- Submission has not already occurred for the ownership instance.
- Game phase permits submission.

## Scoring

Backend verifies:

- Submission is valid.
- Answer is compared against protected answer key.
- Score is updated only once.


# 28. Initial Data Setup

Before the event, administrators will create:

- All teams
- All cards
- Initial card allocations
- Card tiers
- Card point values
- Correct answers
- Starting BitBuck balances
- Initial game state

Players do not modify this setup.

The setup should be performed using a controlled seed/import process rather than manually entering every document in the Firebase console.

The finalized event data is:

    TEAM-01

    100 BitBucks

    Cards:
    A1
    A2
    A3
    A4

    TEAM-02

    100 BitBucks

    Cards:
    B1
    B2
    B3
    B4

    ... (one letter block per team through TEAM-14 / N1-N4)

This is the actual event data, held in the local seed input files described in section 8a, not a placeholder example.


# 29. Seed System

The project should contain a repeatable setup/seed process.

The seed system should be capable of creating:

- Teams
- Cards
- Answer keys
- Initial ownership
- Starting BitBuck balances
- Initial game state

The seed process must be protected from normal player access.

The Firestore-writing seed script (teams, cards, answerKeys, initial ownership, starting BitBuck balances, initial game state) is implemented in `functions/src/seedData/seedEventData.js` / `functions/scripts/seedEventData.js` (see section 8a, "Firestore Seed Script"):

    npm run validate:seed
    npm run seed:event

The existing `functions/scripts/seedTeamCredential.js` seeds only `teamCredentials` records for authentication and is unrelated to card/answer seeding.

The exact implementation may use a trusted server-side/admin environment.

Seed data must NOT expose answer keys to the frontend.


# 30. Database Source of Truth Principle

The database is the source of truth.

The frontend displays database state.

The frontend does NOT invent game state.

Example:

Frontend asks:

    "What cards does Team 04 own?"

Database/backend determines:

    cards where currentOwner == TEAM-04

Frontend asks:

    "How many BitBucks does Team 04 have?"

Database/backend determines:

    teams/TEAM-04.bitBucks

Frontend asks:

    "Who is currently #1?"

Database determines:

    teams ordered by score DESC,
    then bitBucks DESC

Frontend asks:

    "Can this trade happen?"

Backend validates:

    authentication
    ownership
    listing state
    buyer balance
    confirmations
    game phase
    trade state

The frontend must never be the final authority on these decisions.


# 31. Core Architecture Principle

The system follows this rule:

    CLIENT REQUESTS
          ↓
    BACKEND VALIDATES
          ↓
    DATABASE CHANGES
          ↓
    REALTIME CLIENTS UPDATE

The frontend is responsible for:

- Displaying data
- Collecting user input
- Calling approved services
- Showing success/error states
- Rendering realtime updates

The backend is responsible for:

- Authentication
- Authorization
- Validation
- Game rules
- Transactions
- Scoring
- Ownership changes
- BitBuck changes

Firestore is responsible for:

- Persistent game state
- Realtime synchronization
- Source-of-truth data storage


# 32. Final Collection Summary

The final Firestore structure is:

    teams/{teamId}
    cards/{cardId}
    answerKeys/{cardId}
    listings/{listingId}
    trades/{tradeId}
    submissions/{submissionId}
    game/{gameId}
    activityLogs/{logId}

The separation between cards and answerKeys is intentional and required for security.

The frontend must never receive protected answer-key data before the appropriate reveal stage.