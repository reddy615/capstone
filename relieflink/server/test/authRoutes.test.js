const assert = require('node:assert/strict');
const express = require('express');
const { after, before, test } = require('node:test');
const jwt = require('jsonwebtoken');

const User = require('../src/models/User');
const authRoutes = require('../src/routes/authRoutes');
const { protect, authorize } = require('../src/middleware/authMiddleware');
const { errorHandler } = require('../src/middleware/errorMiddleware');
const { ROLES, PUBLIC_REGISTRATION_ROLES } = require('../src/utils/roles');

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
  app.get('/api/operational', protect, authorize(ROLES.VOLUNTEER, ROLES.NGO, ROLES.HOSPITAL), (req, res) => {
    res.status(200).json({ success: true, role: req.user.role });
  });
  app.use(errorHandler);

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

test('registration requires a role and a valid public role registers and can log in', async () => {
  const credentials = {
    name: 'Normal Registration Test',
    email: 'normal-registration@example.invalid',
    password: 'normal-registration-password',
  };
  const missingRoleResponse = await postJson('/api/auth/register', credentials);
  assert.equal(missingRoleResponse.status, 400);
  assert.equal(usersByEmail.has(credentials.email), false);

  const emptyRequestResponse = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST' });
  assert.equal(emptyRequestResponse.status, 400);

  credentials.role = ROLES.VICTIM;
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

test('public operational roles are stored pending and blocked until approved', async () => {
  assert.deepEqual(PUBLIC_REGISTRATION_ROLES, [ROLES.VICTIM, ROLES.VOLUNTEER, ROLES.NGO, ROLES.HOSPITAL]);
  const publicOperationalRoles = [ROLES.VOLUNTEER, ROLES.NGO, ROLES.HOSPITAL];

  for (const role of publicOperationalRoles) {
    const email = `pending-${role}@example.invalid`;
    const response = await postJson('/api/auth/register', {
      name: `${role} Registration Test`,
      email,
      password: 'pending-registration-password',
      role,
      approvalStatus: 'approved',
      isActive: true,
    });
    const registration = await response.json();
    const storedUser = usersByEmail.get(email);

    assert.equal(response.status, 201);
    assert.equal(registration.user.role, role);
    assert.equal(registration.user.approvalStatus, 'pending');
    assert.equal(storedUser.role, role);
    assert.equal(storedUser.approvalStatus, 'pending');
    assert.equal(registration.token, undefined);

    const loginResponse = await postJson('/api/auth/login', { email, password: 'pending-registration-password' });
    assert.equal(loginResponse.status, 403);

    const token = jwt.sign({ id: storedUser._id, role: ROLES.ADMIN }, testJwtSecret);
    const pendingOperationalResponse = await fetch(`${baseUrl}/api/operational`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const forgedAdminResponse = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(pendingOperationalResponse.status, 403);
    assert.equal(forgedAdminResponse.status, 403);

    storedUser.approvalStatus = 'approved';
    const approvedOperationalResponse = await fetch(`${baseUrl}/api/operational`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(approvedOperationalResponse.status, 200);

    const approvedForgedAdminResponse = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(approvedForgedAdminResponse.status, 403);

    const approvedLoginResponse = await postJson('/api/auth/login', {
      email,
      password: 'pending-registration-password',
    });
    const approvedLogin = await approvedLoginResponse.json();
    assert.equal(approvedLoginResponse.status, 200);
    assert.equal(approvedLogin.user.role, role);
    assert.equal(jwt.verify(approvedLogin.token, testJwtSecret).role, undefined);
  }
});

test('public registration rejects admin, authority, empty, and unknown roles', async () => {
  const unauthorizedRoles = [ROLES.ADMIN, ROLES.AUTHORITY, 'superadmin', 'not-a-role', ''];

  for (const role of unauthorizedRoles) {
    const email = `role-escalation-${role}@example.invalid`;
    const response = await postJson('/api/auth/register', {
      name: 'Role Escalation Test',
      email,
      password: 'role-escalation-password',
      role,
    });
    const registration = await response.json();

    assert.equal(response.status, 400, `${role || 'empty'} registration must be rejected`);
    assert.equal(usersByEmail.has(email), false, `${role} account must not be created`);
    assert.equal(registration.token, undefined, `${role} request must not receive a token`);
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