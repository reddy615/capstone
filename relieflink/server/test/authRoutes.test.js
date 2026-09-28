const assert = require('node:assert/strict');
const express = require('express');
const { after, before, test } = require('node:test');
const jwt = require('jsonwebtoken');

const User = require('../src/models/User');
const authRoutes = require('../src/routes/authRoutes');
const { protect, authorize } = require('../src/middleware/authMiddleware');
const { ROLES, ROLE_LIST } = require('../src/utils/roles');

const usersByEmail = new Map();
const usersById = new Map();
const originalMethods = {
  create: User.create,
  findOne: User.findOne,
  findById: User.findById,
};
const originalJwtSecret = process.env.JWT_SECRET;
const testJwtSecret = 'registration-route-test-secret';
let server;
let baseUrl;
let nextUserId = 1;

const addUser = async (details) => {
  const user = {
    _id: `registration-test-user-${nextUserId++}`,
    ...details,
    matchPassword: async (password) => password === details.password,
  };
  usersByEmail.set(user.email, user);
  usersById.set(String(user._id), user);
  return user;
};

before(async () => {
  process.env.JWT_SECRET = testJwtSecret;
  User.findOne = async ({ email }) => usersByEmail.get(email) || null;
  User.create = addUser;
  User.findById = (id) => ({ select: async () => usersById.get(String(id)) || null });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.get('/api/admin/overview', protect, authorize(ROLES.ADMIN), (req, res) => {
    res.status(200).json({ success: true, role: req.user.role });
  });

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
  }
  User.create = originalMethods.create;
  User.findOne = originalMethods.findOne;
  User.findById = originalMethods.findById;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

const postJson = (path, payload) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

test('normal registration defaults to victim, login works, and protected admin access is denied', async () => {
  const credentials = {
    name: 'Normal Registration Test',
    email: 'normal-registration@example.invalid',
    password: 'normal-registration-password',
  };
  const registrationResponse = await postJson('/api/auth/register', credentials);
  const registration = await registrationResponse.json();

  assert.equal(registrationResponse.status, 201);
  assert.equal(registration.user.role, ROLES.VICTIM);
  assert.equal(usersByEmail.get(credentials.email).role, ROLES.VICTIM);

  const loginResponse = await postJson('/api/auth/login', credentials);
  const login = await loginResponse.json();
  assert.equal(loginResponse.status, 200);
  assert.equal(login.user.role, ROLES.VICTIM);
  assert.equal(jwt.verify(login.token, testJwtSecret).role, undefined);

  const anonymousResponse = await fetch(`${baseUrl}/api/admin/overview`);
  const normalResponse = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  assert.equal(anonymousResponse.status, 401);
  assert.equal(normalResponse.status, 403);
});

test('public registration cannot assign any privileged role or grant admin API access', async () => {
  const privilegedRoles = ROLE_LIST.filter((role) => role !== ROLES.VICTIM);
  assert.ok(privilegedRoles.includes(ROLES.ADMIN));

  for (const role of privilegedRoles) {
    const email = `role-escalation-${role}@example.invalid`;
    const response = await postJson('/api/auth/register', {
      name: 'Role Escalation Test',
      email,
      password: 'role-escalation-password',
      role,
    });
    const registration = await response.json();

    assert.equal(response.status, 201, `${role} registration remains available`);
    assert.equal(registration.user.role, ROLES.VICTIM, `${role} request must be downgraded`);
    assert.equal(usersByEmail.get(email).role, ROLES.VICTIM, `${role} must not be stored`);
    assert.equal(jwt.verify(registration.token, testJwtSecret).role, undefined);

    const adminResponse = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${registration.token}` },
    });
    assert.equal(adminResponse.status, 403, `${role} token must not access admin API`);
  }
});

test('an existing server-created admin can log in and access the admin API', async () => {
  const credentials = {
    name: 'Existing Admin Test',
    email: 'existing-admin@example.invalid',
    password: 'existing-admin-password',
    role: ROLES.ADMIN,
  };
  await addUser(credentials);

  const loginResponse = await postJson('/api/auth/login', {
    email: credentials.email,
    password: credentials.password,
  });
  const login = await loginResponse.json();
  assert.equal(loginResponse.status, 200);
  assert.equal(login.user.role, ROLES.ADMIN);
  assert.equal(jwt.verify(login.token, testJwtSecret).role, undefined);

  const adminResponse = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  assert.equal(adminResponse.status, 200);
});