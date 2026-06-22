// App-admin UIDs. The seed/reset dev tool (see firebase/seed.ts) is gated to
// these so an ordinary user can never wipe their data or spawn fixtures. The
// data is owner-scoped anyway — Firestore rules only ever let a user touch their
// OWN documents — so this gate is purely about who SEES the tool, not a security
// boundary.
export const ADMIN_UIDS: readonly string[] = ['b2bn4rTetXaJXCN6amkxjtc6hQB2']

export const isAdmin = (uid: string | undefined): boolean =>
  uid !== undefined && ADMIN_UIDS.includes(uid)
