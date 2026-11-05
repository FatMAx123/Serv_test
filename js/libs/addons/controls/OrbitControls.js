// ============================================================
//  ORBITCONTROLS.JS — Smooth orbital camera controller for Three.js
// ============================================================
import * as THREE from 'three';

export class OrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement || document.body;

    this.enabled = true;
    this.target = new THREE.Vector3(0, 0.9, 0);

    this.minDistance = 0.3;
    this.maxDistance = 15.0;

    this.minPolarAngle = 0.05;
    this.maxPolarAngle = Math.PI - 0.05;

    this.minAzimuthAngle = -Infinity;
    this.maxAzimuthAngle = Infinity;

    this.enableDamping = true;
    this.dampingFactor = 0.08;

    this.enableZoom = true;
    this.zoomSpeed = 1.0;

    this.enableRotate = true;
    this.rotateSpeed = 1.0;

    this.enablePan = true;
    this.panSpeed = 1.0;

    this.autoRotate = false;
    this.autoRotateSpeed = 2.0; // degrees per second

    // Internal state
    this._spherical = new THREE.Spherical();
    this._sphericalTarget = new THREE.Spherical();

    this._state = 'NONE'; // 'ROTATE', 'PAN', 'ZOOM'
    this._pointerStart = new THREE.Vector2();
    this._pointers = new Map();

    // Initialize spherical from current camera position
    const offset = new THREE.Vector3().copy(this.camera.position).sub(this.target);
    this._spherical.setFromVector3(offset);
    this._sphericalTarget.copy(this._spherical);

    this._targetActual = new THREE.Vector3().copy(this.target);

    // Bind event handlers
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('pointercancel', this._onPointerUp);
    this.domElement.addEventListener('wheel', this._onWheel, { passive: false });
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
  }

  _onContextMenu(e) {
    if (this.enabled) e.preventDefault();
  }

  _onPointerDown(e) {
    if (!this.enabled) return;
    this.domElement.setPointerCapture(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pointers.size === 1) {
      if (e.button === 0) this._state = 'ROTATE';
      else if (e.button === 2) this._state = 'PAN';
      else if (e.button === 1) this._state = 'ZOOM';
      this._pointerStart.set(e.clientX, e.clientY);
    } else if (this._pointers.size === 2) {
      this._state = 'TOUCH_ZOOM_PAN';
    }
  }

  _onPointerMove(e) {
    if (!this.enabled || this._state === 'NONE') return;

    if (this._state === 'ROTATE' && this.enableRotate) {
      const dx = (e.clientX - this._pointerStart.x) * 0.005 * this.rotateSpeed;
      const dy = (e.clientY - this._pointerStart.y) * 0.005 * this.rotateSpeed;

      this._sphericalTarget.theta -= dx;
      this._sphericalTarget.phi -= dy;
      this._sphericalTarget.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._sphericalTarget.phi));

      this._pointerStart.set(e.clientX, e.clientY);
    } else if (this._state === 'PAN' && this.enablePan) {
      const dx = (e.clientX - this._pointerStart.x) * 0.002 * this.panSpeed * (this._sphericalTarget.radius / 3.0);
      const dy = (e.clientY - this._pointerStart.y) * 0.002 * this.panSpeed * (this._sphericalTarget.radius / 3.0);

      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

      this.target.addScaledVector(right, -dx);
      this.target.addScaledVector(up, dy);

      this._pointerStart.set(e.clientX, e.clientY);
    } else if (this._state === 'TOUCH_ZOOM_PAN' && this._pointers.size === 2) {
      // Touch pinch zoom
      const pts = Array.from(this._pointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      if (e.pointerId === Array.from(this._pointers.keys())[0]) {
        p1.x = e.clientX; p1.y = e.clientY;
      } else {
        p2.x = e.clientX; p2.y = e.clientY;
      }
    }
  }

  _onPointerUp(e) {
    this._pointers.delete(e.pointerId);
    try { this.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
    if (this._pointers.size === 0) {
      this._state = 'NONE';
    } else if (this._pointers.size === 1) {
      this._state = 'ROTATE';
      const pt = Array.from(this._pointers.values())[0];
      this._pointerStart.set(pt.x, pt.y);
    }
  }

  _onWheel(e) {
    if (!this.enabled || !this.enableZoom) return;
    e.preventDefault();

    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    this._sphericalTarget.radius = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this._sphericalTarget.radius * factor)
    );
  }

  setCameraTarget(targetPos, distance, phi, theta) {
    if (targetPos) this.target.copy(targetPos);
    if (distance != null) this._sphericalTarget.radius = distance;
    if (phi != null) this._sphericalTarget.phi = phi;
    if (theta != null) this._sphericalTarget.theta = theta;
  }

  update(delta = 0.016) {
    if (!this.enabled) return;

    if (this.autoRotate && this._state === 'NONE') {
      const angle = (this.autoRotateSpeed * Math.PI / 180) * delta;
      this._sphericalTarget.theta += angle;
    }

    if (this.enableDamping) {
      this._spherical.theta += (this._sphericalTarget.theta - this._spherical.theta) * this.dampingFactor;
      this._spherical.phi += (this._sphericalTarget.phi - this._spherical.phi) * this.dampingFactor;
      this._spherical.radius += (this._sphericalTarget.radius - this._spherical.radius) * this.dampingFactor;
      this._targetActual.lerp(this.target, this.dampingFactor);
    } else {
      this._spherical.copy(this._sphericalTarget);
      this._targetActual.copy(this.target);
    }

    this._spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this._spherical.phi));

    const offset = new THREE.Vector3().setFromSpherical(this._spherical);
    this.camera.position.copy(this._targetActual).add(offset);
    this.camera.lookAt(this._targetActual);
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
  }
}

