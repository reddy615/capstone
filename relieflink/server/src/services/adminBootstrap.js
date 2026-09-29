const User = require('../models/User');
const { ROLES } = require('../utils/roles');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findMatchingUsers = (userModel, email) => userModel.find({
  email: new RegExp(`^${escapeRegex(email)}$`, 'i'),
});

const passwordMatches = async (user, password) => {
  try {
    return await user.matchPassword(password);
  } catch {
    return false;
  }
};

const bootstrapAdmin = async ({ env = process.env, userModel = User } = {}) => {
  const email = typeof env.RELIEFLINK_ADMIN_EMAIL === 'string'
    ? env.RELIEFLINK_ADMIN_EMAIL.trim().toLowerCase()
    : '';
  const password = env.RELIEFLINK_ADMIN_PASSWORD;

  if (!email || typeof password !== 'string' || !password) {
    return { status: 'skipped' };
  }

  let matches;
  try {
    matches = await findMatchingUsers(userModel, email);
  } catch {
    throw new Error('Admin bootstrap could not query the configured account.');
  }

  if (matches.length > 1) {
    throw new Error('Admin bootstrap found multiple accounts for the configured email.');
  }

  let user = matches[0];
  if (!user) {
    try {
      await userModel.create({
        name: 'ReliefLink Admin',
        email,
        password,
        role: ROLES.ADMIN,
        isActive: true,
      });
      return { status: 'created' };
    } catch (error) {
      if (error?.code !== 11000) {
        throw new Error('Admin bootstrap could not create the configured account.');
      }
      try {
        matches = await findMatchingUsers(userModel, email);
      } catch {
        throw new Error('Admin bootstrap could not verify concurrent account creation.');
      }
      if (matches.length !== 1) {
        throw new Error('Admin bootstrap could not resolve concurrent account creation.');
      }
      [user] = matches;
    }
  }

  let accountChanged = false;
  if (user.role !== ROLES.ADMIN) {
    user.role = ROLES.ADMIN;
    accountChanged = true;
  }
  if (user.isActive !== true) {
    user.isActive = true;
    accountChanged = true;
  }
  if (!(await passwordMatches(user, password))) {
    user.password = password;
    accountChanged = true;
  }

  if (accountChanged) {
    try {
      await user.save();
    } catch {
      throw new Error('Admin bootstrap could not update the configured account.');
    }
    return { status: 'updated' };
  }

  return { status: 'verified' };
};

module.exports = { bootstrapAdmin };