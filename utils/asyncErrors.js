// Express 4 does not catch rejected promises from async route handlers, so a
// single bad request (e.g. a malformed id) used to be able to crash the whole
// process. This patches Express's Layer once so any rejected promise or
// thrown error from an async handler is forwarded to the error middleware.
// Must be required BEFORE any routes are defined.
const Layer = require("express/lib/router/layer");

if (!Layer.prototype.__asyncPatched) {
  Layer.prototype.handle_request = function handle(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return next(); // error-handling middleware, skip
    try {
      const ret = fn(req, res, next);
      if (ret && typeof ret.catch === "function") ret.catch(next);
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__asyncPatched = true;
}
