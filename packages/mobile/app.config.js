// Dynamic Expo config. Expo loads app.json first and passes it in as `config`; we
// only override android.googleServicesFile so the FCM credentials can come from the
// EAS file secret GOOGLE_SERVICES_JSON on cloud builds (the file is gitignored, so a
// plain git-archived build would otherwise omit it). Locally, where the env var is
// unset, it falls back to the on-disk ./google-services.json.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile ?? './google-services.json',
  },
});
