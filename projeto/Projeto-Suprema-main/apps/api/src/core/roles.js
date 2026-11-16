'use strict';
// The profiles an account may hold. What each profile may DO is not decided here:
// permissions live in the role_permissions table and are checked by security.can().
// A profile without rows in that table can sign in and change its password, nothing else.
const ROLES = {
  ADMIN: {label: 'Administrador', managed: false},
  PROFESSOR: {label: 'Professor', managed: true},
  ALUNO: {label: 'Aluno', managed: true},
  COORDENACAO: {label: 'Coordenação', managed: true},
  NUCLEO_AVALIACAO: {label: 'Núcleo de Avaliação', managed: true},
  CSTI: {label: 'CSTI', managed: true},
  // Shared station accounts (OSCE). Never tied to a named teacher.
  OPERACIONAL: {label: 'Usuário operacional', managed: true}
};

const isRole = role => typeof role === 'string' && Object.hasOwn(ROLES, role);
// Profiles the administrator creates, edits and removes in the users screen.
// Administrators are configured only by `npm run admin` on the server.
const managedRoles = Object.keys(ROLES).filter(role => ROLES[role].managed);
const isManagedRole = role => managedRoles.includes(role);
const roleLabel = role => (isRole(role) ? ROLES[role].label : String(role ?? ''));
const listRoles = () => Object.entries(ROLES).map(([id, info]) => ({id, name: info.label, managed: info.managed}));

module.exports = {ROLES, isRole, managedRoles, isManagedRole, roleLabel, listRoles};
