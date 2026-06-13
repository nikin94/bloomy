// Placeholder owner id used to scope records (customers, orders) to an app user
// before Google auth lands on `/`. Every owner-scoped write is tagged with this
// value; swap it for the real authenticated UID once sign-in exists. Kept in
// one place so the auth integration touches a single point.
export const CURRENT_OWNER_ID = 'local'
