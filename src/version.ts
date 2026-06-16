// The version this bundle was built at. Vite stamps it from the deploy git SHA
// (see `define` in vite.config.ts); a local build/dev run gets 'dev'. The
// running app compares it against the deployed /version.json to notice that a
// newer version shipped and prompt the user to reload.
export const APP_VERSION: string = __APP_VERSION__
