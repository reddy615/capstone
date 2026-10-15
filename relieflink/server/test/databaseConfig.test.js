const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  resolveMongoUri,
  validateStagingConfiguration,
} = require('../src/config/databaseConfig');

const productionUri = 'mongodb+srv://prod-user:prod-pass@prod.example.net/relieflink';
const stagingUri = 'mongodb+srv://stage-user:stage-pass@stage.example.net/relieflink_staging';

test('staging mode requires the separately supplied staging URI', () => {
  assert.throws(
    () => resolveMongoUri({ NODE_ENV: 'staging', MONGODB_URI: productionUri }),
    /STAGING_MONGODB_URI must be configured/,
  );
});

test('staging mode never falls back to the production URI', () => {
  assert.equal(
    resolveMongoUri({
      NODE_ENV: 'staging',
      MONGODB_URI: productionUri,
      STAGING_MONGODB_URI: stagingUri,
    }),
    stagingUri,
  );
});

test('staging mode rejects a URI pointing to the same database target', () => {
  assert.throws(
    () => resolveMongoUri({
      NODE_ENV: 'staging',
      MONGODB_URI: 'mongodb+srv://prod-user:prod-pass@prod.example.net/relieflink_staging',
      STAGING_MONGODB_URI: 'mongodb+srv://different-user:different-pass@PROD.example.net/relieflink_staging?retryWrites=true',
    }),
    /different database/,
  );
});

test('staging preflight rejects production and unspecified modes', () => {
  assert.throws(
    () => validateStagingConfiguration({ NODE_ENV: 'production', STAGING_MONGODB_URI: stagingUri }),
    /disabled when NODE_ENV=production/,
  );
  assert.throws(
    () => validateStagingConfiguration({ NODE_ENV: 'test', STAGING_MONGODB_URI: stagingUri }),
    /Set NODE_ENV=staging explicitly/,
  );
});

test('staging preflight validates staging configuration without returning the URI', () => {
  assert.equal(
    validateStagingConfiguration({ NODE_ENV: 'staging', STAGING_MONGODB_URI: stagingUri }),
    undefined,
  );
});

test('staging mode rejects a database name that does not identify a test database', () => {
  assert.throws(
    () => resolveMongoUri({
      NODE_ENV: 'staging',
      STAGING_MONGODB_URI: 'mongodb+srv://stage-user:stage-pass@stage.example.net/relieflink',
    }),
    /must identify a staging or test database/,
  );
});

test('non-staging startup continues to use MONGODB_URI', () => {
  assert.equal(
    resolveMongoUri({ NODE_ENV: 'production', MONGODB_URI: productionUri, STAGING_MONGODB_URI: stagingUri }),
    productionUri,
  );
});

test('MongoDB URI validation rejects placeholders and invalid schemes', () => {
  assert.throws(
    () => resolveMongoUri({
      NODE_ENV: 'staging',
      STAGING_MONGODB_URI: 'mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>',
    }),
    /valid MongoDB URI|placeholder/,
  );
  assert.throws(
    () => resolveMongoUri({
      NODE_ENV: 'staging',
      STAGING_MONGODB_URI: 'https://db.example.net/staging',
    }),
    /valid MongoDB URI/,
  );
});
