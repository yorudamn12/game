// `jose` ships ESM-only and Jest's CommonJS runtime can't parse it.
// It's only reached transitively (firebase-admin -> jwks-rsa) for the
// remote JWKS key-retrieval path used to verify third-party ID tokens,
// which nothing in this suite exercises - loginTeamHandler mints custom
// tokens and never verifies incoming ID tokens. Stubbed out so the
// require chain resolves during tests without affecting runtime code.
module.exports = {};
