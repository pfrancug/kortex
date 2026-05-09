import * as mat4 from './math/mat4';
import * as vec3 from './math/vec3';

/** Mutable orbit-camera parameters. Modify these to change the viewpoint. */
export interface CameraState {
  /** Look-at target (world-space). */
  target: Float32Array;
  /** Distance from target along the orbit arm. */
  distance: number;
  /** Horizontal angle (radians, 0 = +Z). */
  azimuth: number;
  /** Vertical angle (radians, 0 = horizon). */
  elevation: number;
  /** Vertical field of view in radians. */
  fovy: number;
  /** Near clip plane distance. */
  near: number;
  /** Far clip plane distance. */
  far: number;
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Orbit camera. Reads {@link CameraState} and produces
 * view, projection, and combined view-projection matrices.
 */
export class Camera {
  /** Mutable state — controls can write directly. */
  readonly state: CameraState = {
    target: vec3.create(),
    distance: 12,
    azimuth: Math.PI / 4,
    elevation: Math.PI / 6,
    fovy: 60 * DEG_TO_RAD,
    near: 0.01,
    far: 120_000_000,
  };

  /** View matrix (world → eye). Updated by {@link update}. */
  readonly view: mat4.Mat4 = mat4.create();
  /** Projection matrix. Updated by {@link update}. */
  readonly projection: mat4.Mat4 = mat4.create();
  /** Combined view-projection. Updated by {@link update}. */
  readonly viewProjection: mat4.Mat4 = mat4.create();
  /** World-space eye position. Updated by {@link update}. */
  readonly position: vec3.Vec3 = vec3.create();

  private readonly worldUp: vec3.Vec3 = vec3.fromValues(0, 1, 0);

  /** Recompute all matrices from the current {@link state}. Called once per frame. */
  update(aspect: number): void {
    const s = this.state;
    const cosE = Math.cos(s.elevation);
    this.position[0] = s.target[0] + s.distance * cosE * Math.sin(s.azimuth);
    this.position[1] = s.target[1] + s.distance * Math.sin(s.elevation);
    this.position[2] = s.target[2] + s.distance * cosE * Math.cos(s.azimuth);

    mat4.lookAt(this.view, this.position, s.target, this.worldUp);
    mat4.perspective(this.projection, s.fovy, aspect, s.near, s.far);
    mat4.multiply(this.viewProjection, this.projection, this.view);
  }
}
