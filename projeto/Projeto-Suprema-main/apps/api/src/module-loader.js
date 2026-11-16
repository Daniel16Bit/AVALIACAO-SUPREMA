'use strict';
const {Router} = require('express');

function installModules(ctx, manifest, {onError = (id, err) => console.error(`[modulo:${id}]`, err.stack)} = {}) {
  const statuses = [];
  for (const feature of manifest) {
    const router = Router();
    try {
      const install = feature.load();
      if (typeof install !== 'function') throw new TypeError('Modulo sem instalador.');
      // Only publish the router after the entire registration succeeds.
      install({...ctx, app: router});
      ctx.app.use(router);
      statuses.push({id: feature.id, status: 'ready'});
    } catch (err) {
      onError(feature.id, err);
      statuses.push({id: feature.id, status: 'unavailable'});
      ctx.app.use((req, res, next) => {
        if (!feature.owns.test(req.path)) return next();
        res.status(503).json({
          error: 'Este modulo esta temporariamente indisponivel.',
          code: 'MODULE_UNAVAILABLE',
          module: feature.id
        });
      });
    }
  }
  return statuses;
}

module.exports = {installModules};
