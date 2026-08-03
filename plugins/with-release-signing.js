const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

/**
 * Sign release builds with the upload key instead of the debug key.
 *
 * `android/` is generated and gitignored, so hand-editing build.gradle there
 * lasts only until the next prebuild — the Expo template ships
 * `signingConfig signingConfigs.debug` under `release`, and Play rejects a
 * debug-signed upload. This plugin reapplies the change every prebuild.
 *
 * Credentials live in credentials/android-upload-key.json, which is gitignored.
 * Without that file the plugin does nothing and builds stay debug-signed, so a
 * fresh clone still builds for the emulator without the secret.
 */

const CREDENTIALS_FILE = 'credentials/android-upload-key.json';

const PROPS = {
  storeFile: 'DAILY_QURAN_UPLOAD_STORE_FILE',
  storePassword: 'DAILY_QURAN_UPLOAD_STORE_PASSWORD',
  keyAlias: 'DAILY_QURAN_UPLOAD_KEY_ALIAS',
  keyPassword: 'DAILY_QURAN_UPLOAD_KEY_PASSWORD',
};

function readCredentials(projectRoot) {
  const file = path.join(projectRoot, CREDENTIALS_FILE);
  if (!fs.existsSync(file)) {
    console.warn(
      `[with-release-signing] ${CREDENTIALS_FILE} not found — release builds stay debug-signed.`,
    );
    return null;
  }
  const creds = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of ['keystorePath', 'keystorePassword', 'keyAlias', 'keyPassword']) {
    if (!creds[key]) throw new Error(`[with-release-signing] ${CREDENTIALS_FILE} is missing "${key}"`);
  }
  // Gradle resolves a relative storeFile against android/app, so hand it an
  // absolute path and let the keystore live wherever the credentials say.
  creds.absoluteKeystorePath = path.resolve(projectRoot, creds.keystorePath);
  if (!fs.existsSync(creds.absoluteKeystorePath)) {
    throw new Error(`[with-release-signing] keystore not found at ${creds.absoluteKeystorePath}`);
  }
  return creds;
}

function setProperty(properties, key, value) {
  const existing = properties.find((p) => p.type === 'property' && p.key === key);
  if (existing) existing.value = value;
  else properties.push({ type: 'property', key, value });
}

module.exports = function withReleaseSigning(config) {
  config = withGradleProperties(config, (cfg) => {
    const creds = readCredentials(cfg.modRequest.projectRoot);
    if (!creds) return cfg;
    setProperty(cfg.modResults, PROPS.storeFile, creds.absoluteKeystorePath);
    setProperty(cfg.modResults, PROPS.storePassword, creds.keystorePassword);
    setProperty(cfg.modResults, PROPS.keyAlias, creds.keyAlias);
    setProperty(cfg.modResults, PROPS.keyPassword, creds.keyPassword);
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    const creds = readCredentials(cfg.modRequest.projectRoot);
    if (!creds) return cfg;

    let src = cfg.modResults.contents;

    if (!src.includes('release {\n            storeFile')) {
      const anchor = 'signingConfigs {\n';
      if (!src.includes(anchor)) throw new Error('[with-release-signing] no signingConfigs block');
      src = src.replace(
        anchor,
        `${anchor}        release {\n` +
          `            storeFile file(${PROPS.storeFile})\n` +
          `            storePassword ${PROPS.storePassword}\n` +
          `            keyAlias ${PROPS.keyAlias}\n` +
          `            keyPassword ${PROPS.keyPassword}\n` +
          `        }\n`,
      );
    }

    // Anchored on the template's own warning comment so only the release
    // buildType is touched — `debug` has an identical assignment line.
    const before = `// see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug`;
    const after = `// see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.release`;
    if (src.includes(before)) {
      src = src.replace(before, after);
    } else if (!src.includes('signingConfig signingConfigs.release')) {
      throw new Error('[with-release-signing] release buildType signingConfig not found');
    }

    cfg.modResults.contents = src;
    return cfg;
  });

  return config;
};
