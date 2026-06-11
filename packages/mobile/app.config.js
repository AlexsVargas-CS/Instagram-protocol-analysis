// Dynamic Expo config. We load app.json explicitly (rather than relying on the
// injected `config` arg, which doesn't reliably carry `extra`/`owner` through) and
// override only android.googleServicesFile so the FCM credentials can come from the
// EAS file secret GOOGLE_SERVICES_JSON on cloud builds (the file is gitignored, so a
// plain git-archived build would otherwise omit it). Locally, where the env var is
// unset, it falls back to the on-disk ./google-services.json.
const { expo } = require('./app.json');

module.exports = () => ({
  ...expo,
  android: {
    ...expo.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? expo.android?.googleServicesFile ?? './google-services.json',
  },
});
