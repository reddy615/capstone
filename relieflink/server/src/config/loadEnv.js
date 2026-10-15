const path = require('node:path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'staging' ? '.env.staging' : '.env';

dotenv.config({
  path: path.resolve(__dirname, '../..', envFile),
});
