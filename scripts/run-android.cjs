// Regenerates the native Android project from app.json and installs the app on the
// connected device or emulator. Works the same in PowerShell, cmd and bash.
//
//   node scripts/run-android.cjs            replaces the installed app and keeps its notes
//   node scripts/run-android.cjs compare    installs "<name> (new)" next to the existing app
const { spawnSync } = require('node:child_process');

const variant = process.argv[2];
if (variant !== undefined && variant !== 'compare') {
  console.error(`Unknown variant "${variant}". Use "compare" or no argument.`);
  process.exit(1);
}

const env = { ...process.env };
if (variant) env.APP_VARIANT = variant;
else delete env.APP_VARIANT;

const run = (args) => {
  const result = spawnSync('npx', args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// A clean prebuild is what applies the app name, icon, package and native modules.
run(['expo', 'prebuild', '--clean', '--platform', 'android']);
run(['expo', 'run:android']);
