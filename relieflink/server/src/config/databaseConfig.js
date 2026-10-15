const parseMongoTarget = (uri, variableName) => {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error(`${variableName} must be configured.`);
  }

  let parsed;
  try {
    parsed = new URL(uri.trim());
  } catch {
    throw new Error(`${variableName} must be a valid MongoDB URI.`);
  }

  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error(`${variableName} must be a valid MongoDB URI.`);
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] || '');
  } catch {
    throw new Error(`${variableName} must specify a valid database name.`);
  }
  if (!databaseName || /[<>]|^(?:username|password|cluster|database)$/i.test(databaseName)) {
    throw new Error(`${variableName} must specify a database name, not a placeholder.`);
  }

  return {
    uri: uri.trim(),
    databaseName,
    target: `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${parsed.port}/${databaseName}`,
  };
};

const resolveMongoUri = (env = process.env) => {
  if (env.NODE_ENV === 'staging') {
    const staging = parseMongoTarget(env.STAGING_MONGODB_URI, 'STAGING_MONGODB_URI');
    if (!/(?:^|[_-])(?:staging|stage|testing|test)(?:$|[_-])/i.test(staging.databaseName)) {
      throw new Error('STAGING_MONGODB_URI database name must identify a staging or test database.');
    }
    if (env.MONGODB_URI) {
      const configured = parseMongoTarget(env.MONGODB_URI, 'MONGODB_URI');
      if (staging.target === configured.target) {
        throw new Error('STAGING_MONGODB_URI must point to a different database from MONGODB_URI.');
      }
    }
    return staging.uri;
  }

  return parseMongoTarget(env.MONGODB_URI, 'MONGODB_URI').uri;
};

const validateStagingConfiguration = (env = process.env) => {
  if (env.NODE_ENV === 'production') {
    throw new Error('Staging checks are disabled when NODE_ENV=production.');
  }
  if (env.NODE_ENV !== 'staging') {
    throw new Error('Set NODE_ENV=staging explicitly before using staging configuration.');
  }

  resolveMongoUri(env);
};

module.exports = { resolveMongoUri, validateStagingConfiguration };
