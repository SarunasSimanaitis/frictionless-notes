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
    `Expected react-native-draggable-flatlist 4.0.3, found ${packageJson.version}. Recheck the compatibility patches before upgrading this dependency.`,
  );
}

function patchSource(relativePath, patches) {
  const sourcePath = path.join(packageDirectory, relativePath);
  let source = fs.readFileSync(sourcePath, 'utf8');
  let changed = false;

  for (const { description, original, replacement } of patches) {
    if (source.includes(original)) {
      source = source.replace(original, replacement);
      changed = true;
      continue;
    }

    if (!replacement || source.includes(replacement)) continue;

    throw new Error(
      `Could not find the expected ${description} in react-native-draggable-flatlist 4.0.3.`,
    );
  }

  if (changed) fs.writeFileSync(sourcePath, source);
}

patchSource('src/components/DraggableFlatList.tsx', [
  {
    description: 'InteractionManager import',
    original: '  InteractionManager,\n',
    replacement: '',
  },
  {
    description: 'InteractionManager reset scheduling',
    original: `    InteractionManager.runAfterInteractions(() => {
      reset();
    });`,
    replacement: `    requestIdleCallback(() => {
      reset();
    });`,
  },
  {
    description: 'legacy Reanimated scroll-handler dependencies',
    original: `    },
    [horizontalAnim]
  );`,
    replacement: `    }
  );`,
  },
]);

patchSource('src/components/NestableDraggableFlatList.tsx', [
  {
    description: 'findNodeHandle import',
    original: 'import { findNodeHandle, LogBox } from "react-native";',
    replacement: 'import { LogBox } from "react-native";',
  },
  {
    description: 'nested-list layout measurement',
    original: `    const nodeHandle = findNodeHandle(scrollableRef.current);

    const onSuccess = (_x: number, y: number) => {`,
    replacement: `    const relativeTo = scrollableRef.current;
    if (!containerRef.current || !relativeTo) return;

    const onSuccess = (_x: number, y: number) => {`,
  },
  {
    description: 'nested-list measureLayout target',
    original: `    //@ts-ignore
    containerRef.current.measureLayout(nodeHandle, onSuccess, onFail);`,
    replacement: `    containerRef.current.measureLayout(relativeTo, onSuccess, onFail);`,
  },
]);

process.stdout.write(
  'Patched react-native-draggable-flatlist 4.0.3 for React Native 0.88 and Reanimated 4.\n',
);