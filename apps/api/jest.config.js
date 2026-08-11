// .aws-sam/build contains full copies of src + tests per zip-packaged
// function; without these ignores, bare `jest` collects duplicate suites and
// emits a haste-map naming collision on @creditodds/api.
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/.aws-sam/'],
  modulePathIgnorePatterns: ['/.aws-sam/'],
};
