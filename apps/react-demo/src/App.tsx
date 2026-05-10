import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  NexgraphCanvas,
  NexgraphCanvasDataset,
  NexgraphCanvasHandle,
} from '@nexgraph/react';

/** Demo graph: topology-only JSON (canvas runs force layout automatically). */
const DEMO_DATASET: NexgraphCanvasDataset = {
  nodeCount: 4,
  labels: ['A', 'B', 'C', 'D'],
  edges: [
    { source: 0, target: 1 },
    { source: 0, target: 2 },
    { source: 0, target: 3 },
    { source: 1, target: 2 },
    { source: 1, target: 3 },
    { source: 2, target: 3 },
  ],
};

export function App(): ReactElement {
  const ref = useRef<NexgraphCanvasHandle>(null);

  const [zoomDistance, setZoomDistance] = useState(50);

  useEffect(() => {
    const timeout = 3000;
    setTimeout(() => {
      setZoomDistance(200);
    }, timeout);
  }, []);

  useEffect(() => {
    const timeout = 1000;
    setTimeout(() => {
      const zoomDistance = 100;
      if (ref.current) {
        ref.current.setZoomDistance(zoomDistance);
      }
    }, timeout);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <NexgraphCanvas
        ref={ref}
        contextOptions={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        autoForceLayout={true}
        fitGraph={true}
        showOverlay
        dataset={DEMO_DATASET}
        edgeOpacity={0.25}
        nodeOpacity={0.9}
        backgroundColor={'#09090B'}
        maxVisibleLabels={Infinity}
        nodeSizeMultiplier={1.5}
        nodeColor={() => [255, 0, 0]}
        linkColor={() => [140, 170, 220]}
        forceLayoutPreset={'stability'}
        autoStart={true}
        zoomDistance={zoomDistance}
        autoRotate={false}
        autoRotateSpeed={0.75}
        enableNavigationControls={true}
      />
      <div className='hint'>
        React + @nexgraph/react — drag = orbit | shift+drag / right-drag = pan |
        wheel = zoom
      </div>
    </div>
  );
}
