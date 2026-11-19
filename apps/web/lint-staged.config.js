export default {
  '*.{js,ts,svelte}': ['eslint --fix', 'prettier --write'],
  '!(*.{js,ts,svelte})': 'prettier --write --ignore-unknown',
};
