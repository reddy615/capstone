const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const User = require('../src/models/User');
const { ROLES } = require('../src/utils/roles');
const { authorize } = require('../src/middleware/authMiddleware');
const { errorHandler } = require('../src/middleware/errorMiddleware');
const adminRoutes = require('../src/routes/adminRoutes');

const createMockRes = () => ({
  statusCode: 200,
  json(payload) {
    this.payload = payload;
    return this;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  send(payload) {
    this.payload = payload;
    return this;
  },
});

test('admin authorization rejects non-admin users', () => {
  let called = false;
  const next = (err) => {
    called = true;
    assert.ok(err);
    assert.equal(err.statusCode, 403);
  };

  authorize(ROLES.ADMIN)({ user: { role: ROLES.VICTIM } }, createMockRes(), next);
  assert.equal(called, true);
});

test('admin authorization allows admin users', () => {
  let nextCalled = false;
  const req = { user: { role: ROLES.ADMIN } };
  const res = createMockRes();
  const next = () => {
    nextCalled = true;
  };

  authorize(ROLES.ADMIN)(req, res, next);
  assert.equal(nextCalled, true);
});

test('admin routes module is available', () => {
  assert.ok(adminRoutes);
});

test('admin approval API approves and rejects operational users and rejects non-admins', async () => {
  const originalFindById = User.findById;
  const originalJwtSecret = process.env.JWT_SECRET;
  const secret = 'admin-approval-route-test-secret';
  const users = new Map();
  const admin = { _id: 'admin-1', name: 'Test Admin', email: 'admin@example.invalid', role: ROLES.ADMIN, isActive: true };
  const victim = { _id: 'victim-1', name: 'Test Victim', email: 'victim@example.invalid', role: ROLES.VICTIM, isActive: true };
  const volunteer = {
    _id: 'volunteer-1',
    name: 'Test Volunteer',
    email: 'volunteer@example.invalid',
    role: ROLES.VOLUNTEER,
    isActive: true,
    approvalStatus: 'pending',
    save: async () => {},
  };
  users.set(admin._id, admin);
  users.set(victim._id, victim);
  users.set(volunteer._id, volunteer);
  User.findById = (id) => ({ select: async () => users.get(String(id)) || null });
  process.env.JWT_SECRET = secret;

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const adminToken = jwt.sign({ id: admin._id }, secret);
  const victimToken = jwt.sign({ id: victim._id }, secret);

  const patchApproval = (token, id, approvalStatus) => fetch(`${baseUrl}/api/admin/users/${id}/approval`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalStatus }),
  });

  try {
    const deniedResponse = await patchApproval(victimToken, volunteer._id, 'approved');
    assert.equal(deniedResponse.status, 403);

    const approvedResponse = await patchApproval(adminToken, volunteer._id, 'approved');
    const approved = await approvedResponse.json();
    assert.equal(approvedResponse.status, 200);
    assert.equal(approved.user.approvalStatus, 'approved');

    const rejectedResponse = await patchApproval(adminToken, volunteer._id, 'rejected');
    const rejected = await rejectedResponse.json();
    assert.equal(rejectedResponse.status, 200);
    assert.equal(rejected.user.approvalStatus, 'rejected');

    const adminTargetResponse = await patchApproval(adminToken, admin._id, 'approved');
    assert.equal(adminTargetResponse.status, 400);
    const invalidStatusResponse = await patchApproval(adminToken, volunteer._id, 'pending');
    assert.equal(invalidStatusResponse.status, 400);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
    User.findById = originalFindById;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  }
});
