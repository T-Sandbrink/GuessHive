export default {
  '*.js': ['eslint --fix', 'prettier --write'],
  '!(*.js)': 'prettier --write --ignore-unknown',
};
