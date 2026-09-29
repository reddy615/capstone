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

test('admin users API is protected and returns paginated safe user records with filters', async () => {
  const originalFindById = User.findById;
  const originalFind = User.find;
  const originalCountDocuments = User.countDocuments;
  const originalJwtSecret = process.env.JWT_SECRET;
  const secret = 'admin-user-list-test-secret';
  const roleUsers = [ROLES.ADMIN, ROLES.VICTIM, ROLES.VOLUNTEER, ROLES.NGO, ROLES.HOSPITAL];
  const authUsers = new Map(roleUsers.map((role) => [role, {
    _id: `${role}-id`,
    role,
    isActive: true,
    approvalStatus: role === ROLES.VOLUNTEER || role === ROLES.NGO || role === ROLES.HOSPITAL ? 'approved' : 'not_required',
  }]));
  let capturedFilter;
  let capturedPage;
  User.findById = (id) => ({ select: async () => [...authUsers.values()].find((entry) => String(entry._id) === String(id)) || null });
  User.find = (filter) => {
    capturedFilter = filter;
    return {
      select(selection) {
        assert.equal(selection, '-password');
        return this;
      },
      sort() { return this; },
      skip(value) { capturedPage = { skip: value }; return this; },
      limit(value) { capturedPage.limit = value; return this; },
      lean: async () => [{
        _id: 'victim-id',
        name: 'Real User',
        email: 'real@example.invalid',
        phone: '555-0101',
        role: ROLES.VICTIM,
        isActive: true,
        approvalStatus: 'not_required',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        lastLoginAt: null,
        location: null,
        password: 'must-not-leak',
      }],
    };
  };
  User.countDocuments = async () => 41;
  process.env.JWT_SECRET = secret;

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = (role) => jwt.sign({ id: authUsers.get(role)._id, role: ROLES.ADMIN }, secret);

  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/users`);
    assert.equal(unauthenticated.status, 401);
    for (const role of roleUsers.filter((value) => value !== ROLES.ADMIN)) {
      const response = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${tokenFor(role)}` },
      });
      assert.equal(response.status, 403, `${role} must not access admin users`);
    }

    const response = await fetch(`${baseUrl}/api/admin/users?page=3&limit=10&role=victim&status=active&search=real` , {
      headers: { Authorization: `Bearer ${tokenFor(ROLES.ADMIN)}` },
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.total, 41);
    assert.equal(data.page, 3);
    assert.equal(data.limit, 10);
    assert.equal(data.totalPages, 5);
    assert.equal(data.users.length, 1);
    assert.equal(data.users[0].name, 'Real User');
    assert.equal(data.users[0].role, ROLES.VICTIM);
    assert.equal(data.users[0].phone, '555-0101');
    assert.equal(capturedPage.skip, 20);
    assert.equal(capturedPage.limit, 10);
    assert.equal(capturedFilter.role, ROLES.VICTIM);
    assert.equal(capturedFilter.isActive, true);
    assert.equal(capturedFilter.$and[0].$or[0].name.$regex, 'real');
    assert.equal(JSON.stringify(data).includes('must-not-leak'), false);
    assert.equal(JSON.stringify(data).toLowerCase().includes('password'), false);

    const adminList = await fetch(`${baseUrl}/api/admin/users?role=admin`, {
      headers: { Authorization: `Bearer ${tokenFor(ROLES.ADMIN)}` },
    });
    assert.equal(adminList.status, 200);
    assert.equal(capturedFilter.role, ROLES.ADMIN);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
    User.findById = originalFindById;
    User.find = originalFind;
    User.countDocuments = originalCountDocuments;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  }
});
