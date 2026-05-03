// Shared serverless-mysql client used by every Lambda handler.
// Centralizing config keeps credential rotation and connection tuning in one place.
module.exports = require("serverless-mysql")({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
  },
});
