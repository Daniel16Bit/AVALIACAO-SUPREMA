'use strict';
// Compatibility for integrations that import the original entry point.
const api = require('./apps/api/server');
if (require.main === module) require('./scripts/start').start();
module.exports = api;
