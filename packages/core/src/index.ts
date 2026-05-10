// ── Primary API ─────────────────────────────────────────────────────

export {
  Renderer,
  clampPresentationScale,
  clampEdgeOpacity,
  clampNodeOpacity,
  clampVisibleLabelCount,
  MAX_VISIBLE_LABELS_UNLIMITED,
  normalizeBackgroundColor,
  DEFAULT_BACKGROUND_COLOR,
} from './renderer/Renderer';
export type {
  RendererOptions,
  DrawCallback,
  BeforeFrameCallback,
  BackgroundColor,
} from './renderer/Renderer';

export { GraphStore } from './graph/GraphStore';
export type { GraphBuffers } from './graph/GraphStore';
export { applyDegreeWeightFilters } from './graph/applyGraphFilters';

// ── Camera & Controls ───────────────────────────────────────────────

export { Camera } from './renderer/Camera';
export type { CameraState } from './renderer/Camera';

export { OrbitControls } from './renderer/OrbitControls';
export type { OrbitConfig } from './renderer/OrbitControls';

// ── Interaction ─────────────────────────────────────────────────────

export { PickingSystem } from './interaction/PickingSystem';
export type {
  PickingCallbacks,
  PickGraphArrays,
} from './interaction/PickingSystem';

// ── LOD ─────────────────────────────────────────────────────────────

export { LODController } from './lod/LODController';
export type { LODSettings } from './lod/LODController';

export { ClusterLOD } from './lod/ClusterLOD';
export type { ClusterLevel } from './lod/ClusterLOD';

// ── Diagnostics ─────────────────────────────────────────────────────

export { DebugOverlay } from './renderer/DebugOverlay';
export type { DebugStats } from './renderer/DebugOverlay';

// ── Layout ──────────────────────────────────────────────────────

export { ForceLayout } from './layout/ForceLayout';
export { EDGE_WEIGHT_EXPONENT } from './layout/edgeWeightFactors';
export { FORCE_LAYOUT_DEFAULTS } from './layout/ForceWorker';
export {
  createForceConfigPreset,
  type ForceLayoutPresetId,
} from './layout/forceLayoutPresets';
export type {
  ForceConfig,
  ForceScaleMode,
  LinkAttractionMode,
  IntegrationMode,
  EdgeWeightInfluence,
} from './layout/ForceWorker';

export {
  axisAlignedExtent,
  typicalStoredRadius,
  suggestedNodeSizeMultiplierFromLayout,
} from './layout/autoNodeScale';

// ── Workers ─────────────────────────────────────────────────────────

export { parseGraphAsync } from './workers/parseGraphAsync';
export type {
  ParseRequest,
  ParseResult,
  ParseError,
  GraphJsonNode,
  GraphJsonEdge,
  GraphJsonDocument,
} from './workers/GraphParseWorker';

// ── Advanced / Internal ─────────────────────────────────────────────
// These are exported for power-users building custom renderers.
// They are NOT part of the stable public API and may change.

export { NodeRenderer } from './renderer/NodeRenderer';
export { EdgeRenderer } from './renderer/EdgeRenderer';
export { PickRenderer } from './renderer/PickRenderer';
export {
  LabelRenderer,
  LABEL_MAX_NODES_PER_BUILD,
} from './renderer/LabelRenderer';
export { createSdfAtlas, measureText } from './renderer/SdfAtlas';
export type { SdfAtlasData, GlyphMetrics } from './renderer/SdfAtlas';
export { FrustumCuller } from './renderer/FrustumCuller';
export { ChunkIndex } from './graph/ChunkIndex';
export type { ChunkRange } from './graph/ChunkIndex';
export { RenderLoop } from './renderer/RenderLoop';
export type { FrameCallback } from './renderer/RenderLoop';

export {
  createWebGL2Context,
  type ContextOptions,
} from './renderer/gl/context';
export {
  compileShader,
  linkProgram,
  getUniformLocations,
} from './renderer/gl/shader';
export {
  createStaticBuffer,
  createDynamicBuffer,
  updateBufferRange,
} from './renderer/gl/buffer';

export * as mat4 from './renderer/math/mat4';
export * as vec3 from './renderer/math/vec3';
