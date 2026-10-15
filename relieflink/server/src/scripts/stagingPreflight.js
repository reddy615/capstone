require('../config/loadEnv');

const { validateStagingConfiguration } = require('../config/databaseConfig');

try {
  validateStagingConfiguration();
  console.log('Staging configuration is valid. No database connection was made.');
} catch (error) {
  console.error(`Staging preflight failed: ${error.message}`);
  process.exitCode = 1;
}
