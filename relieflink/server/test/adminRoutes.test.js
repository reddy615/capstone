const test = require('node:test');
const assert = require('node:assert/strict');

const { ROLES } = require('../src/utils/roles');
const { authorize } = require('../src/middleware/authMiddleware');

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
  const adminRoutes = require('../src/routes/adminRoutes');
  assert.ok(adminRoutes);
});
