// Root lint-staged config. Packages with their own ESLint setup have a
// lint-staged.config.js of their own; lint-staged uses the closest one.
export default {
  '*': 'prettier --write --ignore-unknown',
};
