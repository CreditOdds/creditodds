// Sentry's Lambda layer replaces the handler property at cold start. Keep the
// entrypoint CommonJS: esbuild's ESM export getters are non-configurable.
const { CspReportHandler } = require('./csp-report-core');
exports.CspReportHandler = CspReportHandler;
