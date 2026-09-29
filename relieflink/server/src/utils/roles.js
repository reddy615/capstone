const ROLES = {
  VICTIM: 'victim',
  VOLUNTEER: 'volunteer',
  NGO: 'ngo',
  HOSPITAL: 'hospital',
  AUTHORITY: 'authority',
  ADMIN: 'admin',
};

const ROLE_LIST = Object.values(ROLES);
const PUBLIC_REGISTRATION_ROLES = [ROLES.VICTIM];

module.exports = { ROLES, ROLE_LIST, PUBLIC_REGISTRATION_ROLES };
