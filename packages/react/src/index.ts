/** React bindings for Nexgraph — GPU-first WebGL2 graph visualization. */

export {
  NexgraphCanvas,
  type NexgraphCanvasProps,
  type NexgraphCanvasHandle,
  type NexgraphCanvasGraphProps,
  type NexgraphCanvasDataset,
  type NexgraphRgb,
  type NexgraphNodeColorContext,
  type NexgraphNodeClickContext,
  type NexgraphNodeColorFn,
  type NexgraphEdgeColorContext,
  type NexgraphEdgeColorFn,
  clampOrbitDistance,
  DEFAULT_AUTO_ROTATE_SPEED,
} from './NexgraphCanvas';
export type {
  ParseResult,
  ForceLayoutPresetId,
  GraphJsonDocument,
  GraphJsonNode,
  GraphJsonEdge,
  BackgroundColor,
} from '@nexgraph/core';
