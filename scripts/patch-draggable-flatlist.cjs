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

  for (const { description, original, replacement, all } of patches) {
    if (source.includes(original)) {
      source = all ? source.replaceAll(original, replacement) : source.replace(original, replacement);
      changed = true;
      continue;
    }
    if (source.includes(replacement)) continue;
    throw new Error(`Could not find the expected ${description} in react-native-draggable-flatlist 4.0.3.`);
  }
  if (changed) fs.writeFileSync(sourcePath, source);
}

function replaceRegion(relativePath, startMarker, endMarker, replacement) {
  const sourcePath = path.join(packageDirectory, relativePath);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    if (source.includes(replacement.trim())) return;
    throw new Error(`Could not find the expected source region in react-native-draggable-flatlist 4.0.3: ${relativePath}`);
  }
  const next = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
  if (next !== source) fs.writeFileSync(sourcePath, next);
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
    description: 'Reanimated scroll-handler dependencies',
    original: `    },
    [horizontalAnim]
  );`,
    replacement: `    }
  );`,
  },
  {
    description: 'Reanimated release reaction dependencies',
    original: `    },
    [isTouchActiveNative, onDragEnd, onRelease]
  );`,
    replacement: `    }
  );`,
  },
  {
    description: 'Reanimated placeholder reaction dependencies',
    original: `    },
    [spacerIndexAnim]
  );`,
    replacement: `    }
  );`,
  },
]);

patchSource('src/components/CellRendererComponent.tsx', [
  {
    description: 'Reanimated animated-style dependencies',
    original: '  }, [translate, activeKey]);',
    replacement: '  });',
  },
  {
    description: 'cell layout event measurements',
    original: '  const updateCellMeasurements = useStableCallback(() => {',
    replacement: '  const updateCellMeasurements = useStableCallback((layout?: LayoutChangeEvent["nativeEvent"]["layout"]) => {',
  },
  {
    description: 'animated-ref measurement',
    original: `    const containerNode = containerRef.current;
    const viewNode = viewRef.current;
    const nodeHandle = containerNode;

    if (viewNode && nodeHandle) {
      //@ts-ignore
      viewNode.measureLayout(nodeHandle, onSuccess, onFail);
    }`,
    replacement: `    if (layout) {
      onSuccess(layout.x, layout.y, layout.width, layout.height);
      return;
    }

    // Web layout events are not re-fired when FlatList indices change.
    if (!isWeb) return;
    const containerNode = containerRef.current;
    const viewNode = viewRef.current;
    const nodeHandle = containerNode;

    if (viewNode && nodeHandle) {
      // @ts-ignore - DOM measurement is retained for web-only index changes.
      viewNode.measureLayout(nodeHandle, onSuccess, onFail);
    }`,
  },
  {
    description: 'cell layout event forwarding',
    original: '    updateCellMeasurements();',
    replacement: '    updateCellMeasurements(e?.nativeEvent.layout);',
  },
]);

patchSource('src/components/CellDecorators.tsx', [
  { description: 'scale decorator Reanimated dependencies', original: '  }, [isActive]);', replacement: '  });' },
  { description: 'shadow decorator Reanimated dependencies', original: '  }, [isActive, onActiveAnim]);', replacement: '  });' },
  { description: 'opacity decorator Reanimated dependencies', original: '  }, [isActive]);', replacement: '  });' },
]);

patchSource('src/components/PlaceholderItem.tsx', [
  {
    description: 'placeholder Reanimated dependencies',
    original: '  }, [spacerIndexAnim, placeholderOffset, horizontalAnim, scrollOffset, size]);',
    replacement: '  });',
  },
]);

patchSource('src/components/NestableDraggableFlatList.tsx', [
  {
    description: 'nested-list React ref imports',
    original: 'import React, { useRef, useState } from "react";',
    replacement: 'import React, { useState } from "react";',
  },
  {
    description: 'nested-list warning suppression import',
    original: 'import { findNodeHandle, LogBox } from "react-native";',
    replacement: '',
  },  {
    description: 'nested-list previously patched warning import',
    original: 'import { LogBox } from "react-native";',
    replacement: '',
  },
  {
    description: 'nested-list error suppression',
    original: `  const hasSuppressedWarnings = useRef(false);

  if (!hasSuppressedWarnings.current) {
    LogBox.ignoreLogs([
      "VirtualizedLists should never be nested inside plain ScrollViews with the same orientation because it can break windowing",
    ]); // Ignore log notification by message
    //@ts-ignore
    console.reportErrorsAsExceptions = false;
    hasSuppressedWarnings.current = true;
  }

`,
    replacement: '',
  },
  {
    description: 'nested-list unused scroll ref',
    original: '    scrollableRef,\n',
    replacement: '',
  },
  {
    description: 'nested-list animated-value dependencies',
    original: '  }, [listHoverOffset]);',
    replacement: '  });',
  },
]);
replaceRegion(
  'src/components/NestableDraggableFlatList.tsx',
  '  const onListContainerLayout = useStableCallback(',
  '  const onDragBegin:',
  `  const onListContainerLayout = useStableCallback(({ layout }) => {
    listVerticalOffset.value = layout.y;
  });

`,
);

patchSource('src/context/animatedValueContext.tsx', [
  {
    description: 'animated-value worklet dependencies',
    original: '}, []);',
    replacement: '});',
    all: true,
  },
  {
    description: 'animated hover-offset dependencies',
    original: '  }, [hoverAnim, activeCellOffset]);',
    replacement: '  });',
  },
  {
    description: 'animated reaction dependencies',
    original: `    },
    [outerScrollOffset]
  );`,
    replacement: `    }
  );`,
  },
]);

patchSource('src/hooks/useCellTranslate.tsx', [
  {
    description: 'cell-translation worklet dependencies',
    original: '  }, [activeKey, cellIndex]);',
    replacement: '  });',
  },
]);

patchSource('src/hooks/useOnCellActiveAnimation.ts', [
  {
    description: 'active-cell animation dependencies',
    original: '  }, [isActive]);',
    replacement: '  });',
  },
]);

patchSource('src/hooks/useAutoScroll.tsx', [
  {
    description: 'auto-scroll worklet dependencies',
    original: '}, []);',
    replacement: '});',
    all: true,
  },
]);

patchSource('src/hooks/useNestedAutoScroll.tsx', [
  {
    description: 'nested auto-scroll worklet dependencies',
    original: '}, []);',
    replacement: '});',
    all: true,
  },
  {
    description: 'nested edge-distance worklet dependencies',
    original: '  }, [hoverScreenOffset]);',
    replacement: '  });',
  },
  {
    description: 'nested bottom-edge worklet dependencies',
    original: '  }, [hoverScreenOffset, activeCellSize, containerSize]);',
    replacement: '  });',
  },
  {
    description: 'nested autoscroll worklet dependencies',
    original: '  }, [autoscrollSpeed, autoscrollThreshold, isDraggingCell]);',
    replacement: '  });',
  },
  {
    description: 'nested auto-scroll reaction dependencies',
    original: `    },
    [activeCellSize]
  );`,
    replacement: `    }
  );`,
  },
]);

patchSource('src/components/ScrollOffsetListener.tsx', [
  {
    description: 'scroll-offset reaction dependencies',
    original: '  }, [scrollOffset])',
    replacement: '  })',
  },
]);

process.stdout.write(
  'Patched react-native-draggable-flatlist 4.0.3 for React Native 0.88 and Reanimated 4.\n',
);