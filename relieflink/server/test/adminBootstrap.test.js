const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const test = require('node:test');

const { bootstrapAdmin } = require('../src/services/adminBootstrap');
const { ROLES } = require('../src/utils/roles');

const makeUser = (data, users) => {
  const user = { ...data, saveCount: 0 };
  user.matchPassword = (password) => bcrypt.compare(password, user.password);
  user.save = async () => {
    if (!user.password.startsWith('$2')) {
      user.password = await bcrypt.hash(user.password, 4);
    }
    user.saveCount += 1;
    if (!users.includes(user)) users.push(user);
  };
  return user;
};

const makeUserModel = (initialUsers = []) => {
  const users = initialUsers;
  return {
    users,
    find: async ({ email }) => users.filter((user) => email.test(user.email)),
    create: async (data) => {
      if (users.some((user) => user.email.toLowerCase() === data.email.toLowerCase())) {
        const error = new Error('duplicate key');
        error.code = 11000;
        throw error;
      }
      const user = makeUser(data, users);
      await user.save();
      return user;
    },
  };
};

const configuredEnv = {
  RELIEFLINK_ADMIN_EMAIL: '  Ops.Admin@Example.com  ',
  RELIEFLINK_ADMIN_PASSWORD: 'configured-test-password',
};

test('bootstrap safely skips when either required environment variable is absent', async () => {
  let queryCount = 0;
  const userModel = {
    find: async () => { queryCount += 1; return []; },
    create: async () => { throw new Error('must not create'); },
  };

  assert.deepEqual(await bootstrapAdmin({ env: {}, userModel }), { status: 'skipped' });
  assert.deepEqual(await bootstrapAdmin({ env: { RELIEFLINK_ADMIN_EMAIL: configuredEnv.RELIEFLINK_ADMIN_EMAIL }, userModel }), { status: 'skipped' });
  assert.deepEqual(await bootstrapAdmin({ env: { RELIEFLINK_ADMIN_PASSWORD: configuredEnv.RELIEFLINK_ADMIN_PASSWORD }, userModel }), { status: 'skipped' });
  assert.equal(queryCount, 0);
});

test('bootstrap creates one normalized admin and remains idempotent', async () => {
  const userModel = makeUserModel();

  assert.deepEqual(await bootstrapAdmin({ env: configuredEnv, userModel }), { status: 'created' });
  assert.deepEqual(await bootstrapAdmin({ env: configuredEnv, userModel }), { status: 'verified' });
  assert.equal(userModel.users.length, 1);
  assert.equal(userModel.users[0].email, 'ops.admin@example.com');
  assert.equal(userModel.users[0].role, ROLES.ADMIN);
  assert.equal(userModel.users[0].isActive, true);
  assert.notEqual(userModel.users[0].password, configuredEnv.RELIEFLINK_ADMIN_PASSWORD);
  assert.equal(await userModel.users[0].matchPassword(configuredEnv.RELIEFLINK_ADMIN_PASSWORD), true);
  assert.equal(userModel.users[0].saveCount, 1);
});

test('bootstrap repairs an existing account without creating a duplicate', async () => {
  const initialPasswordHash = await bcrypt.hash('previous-password', 4);
  const userModel = makeUserModel([
    makeUser({
      email: 'OPS.ADMIN@example.com',
      password: initialPasswordHash,
      role: ROLES.VICTIM,
      isActive: false,
    }, []),
  ]);
  const existingUser = userModel.users[0];

  assert.deepEqual(await bootstrapAdmin({ env: configuredEnv, userModel }), { status: 'updated' });
  assert.deepEqual(await bootstrapAdmin({ env: configuredEnv, userModel }), { status: 'verified' });
  assert.equal(userModel.users.length, 1);
  assert.equal(existingUser.role, ROLES.ADMIN);
  assert.equal(existingUser.isActive, true);
  assert.notEqual(existingUser.password, configuredEnv.RELIEFLINK_ADMIN_PASSWORD);
  assert.notEqual(existingUser.password, initialPasswordHash);
  assert.equal(await existingUser.matchPassword(configuredEnv.RELIEFLINK_ADMIN_PASSWORD), true);
  assert.equal(existingUser.saveCount, 1);
});

test('bootstrap rejects pre-existing case-insensitive duplicates without creating accounts', async () => {
  const users = [
    makeUser({ email: 'ops.admin@example.com', password: await bcrypt.hash('one', 4), role: ROLES.ADMIN, isActive: true }, []),
    makeUser({ email: 'OPS.ADMIN@example.com', password: await bcrypt.hash('two', 4), role: ROLES.ADMIN, isActive: true }, []),
  ];
  const userModel = makeUserModel(users);

  await assert.rejects(bootstrapAdmin({ env: configuredEnv, userModel }), /multiple accounts/);
  assert.equal(userModel.users.length, 2);
});