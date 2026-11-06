// Sentry's Lambda layer replaces the handler property at cold start. Keep the
// entrypoint CommonJS: esbuild's ESM export getters are non-configurable.
const { BestCardForMeHandler } = require('./best-card-for-me-core');
exports.BestCardForMeHandler = BestCardForMeHandler;
