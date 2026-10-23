const fs = require('node:fs');
const path = require('node:path');

const packageDirectory = path.dirname(
  require.resolve('react-native-draggable-flatlist/package.json'),
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'),
);

if (packageJson.version !== '4.0.3') {
  throw new Error(
    `Expected react-native-draggable-flatlist 4.0.3, found ${packageJson.version}. Recheck the InteractionManager patch before upgrading this dependency.`,
  );
}

const sourcePath = path.join(
  packageDirectory,
  'src/components/DraggableFlatList.tsx',
);
const originalImport = '  InteractionManager,\n';
const patchedCall = `    requestIdleCallback(() => {
      reset();
    });`;
const originalCall = `    InteractionManager.runAfterInteractions(() => {
      reset();
    });`;
let source = fs.readFileSync(sourcePath, 'utf8');

if (!source.includes('InteractionManager')) {
  if (source.includes(patchedCall)) {
    process.stdout.write(
      'react-native-draggable-flatlist already uses requestIdleCallback.\n',
    );
    process.exit(0);
  }

  throw new Error(
    'react-native-draggable-flatlist 4.0.3 changed unexpectedly; review its scheduling code before continuing.',
  );
}

if (!source.includes(originalImport) || !source.includes(originalCall)) {
  throw new Error(
    'Could not find the expected InteractionManager import and call in react-native-draggable-flatlist 4.0.3.',
  );
}

source = source.replace(originalImport, '');
source = source.replace(originalCall, patchedCall);
fs.writeFileSync(sourcePath, source);
process.stdout.write(
  'Patched react-native-draggable-flatlist 4.0.3 to use requestIdleCallback.\n',
);
