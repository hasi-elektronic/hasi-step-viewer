import { MathUtils, MOUSE, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

/** Freie CAD-Navigation ohne feste Hochachse oder Polsperre. */
class CadControls extends TrackballControls {
  /** @param {import('three').PerspectiveCamera} camera @param {HTMLCanvasElement} element */
  constructor(camera, element) {
    if (camera.position.lengthSq() === 0) camera.position.set(0, 0, 1);
    super(camera, element);
    this.staticMoving = true;
    this.rotateSpeed = 2;
    this.panSpeed = 1;
    this.keys = []; // Buchstaben bleiben für CAD-Befehle frei.
    setNavigationTool(this, 'wahl');
    this.listeners = new AbortController();
    const {signal} = this.listeners;
    element.addEventListener('pointerdown', event => {
      this.handleResize(); // Auch nach verschobenen/eingeklappten Seitenleisten.
      this.mouseButtons.MIDDLE = event.ctrlKey || event.metaKey || event.shiftKey ? MOUSE.PAN : MOUSE.ROTATE;
    }, {capture:true, signal});
    // Letztes Zeigerereignis vor dem Loslassen anwenden, ohne Nachlauf.
    element.addEventListener('pointerup', () => { if (this.enabled) this.update(); }, {capture:true, signal});
    const ray = new Raycaster(), plane = new Plane(), pointer = new Vector2(), normal = new Vector3(), anchor = new Vector3();
    element.addEventListener('wheel', event => {
      if (!this.enabled || this.noZoom) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // Perspektivischer Zoom um den Cursor auf der Zielebene, einschließlich
      // Kamera-ViewOffset. Blickrichtung und Kamerarollwinkel bleiben erhalten.
      this.update();
      camera.updateMatrixWorld();
      pointer.set((event.clientX-rect.left)/rect.width*2-1, 1-(event.clientY-rect.top)/rect.height*2);
      camera.getWorldDirection(normal);
      plane.setFromNormalAndCoplanarPoint(normal, this.target);
      ray.setFromCamera(pointer, camera);
      if (!ray.ray.intersectPlane(plane, anchor)) return;
      const distance = camera.position.distanceTo(this.target);
      if (distance <= 0) return;
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const requested = distance * Math.exp(MathUtils.clamp(pixels * 0.001, -1, 1));
      const factor = MathUtils.clamp(requested, Math.max(this.minDistance, camera.near*2), this.maxDistance) / distance;
      this.dispatchEvent({type:'start',cursorZoom:true});
      camera.position.sub(anchor).multiplyScalar(factor).add(anchor);
      this.target.sub(anchor).multiplyScalar(factor).add(anchor);
      this.update();
      this.dispatchEvent({type:'end'});
    }, {capture:true, passive:false, signal});
  }

  dispose() {
    this.listeners.abort();
    super.dispose();
  }
}

/** @param {import('three').PerspectiveCamera} camera @param {HTMLCanvasElement} element */
export const createCadControls = (camera, element) => new CadControls(camera, element);

/** @param {TrackballControls} controls @param {string} tool */
export function setNavigationTool(controls, tool) {
  controls.mouseButtons = {LEFT:null, MIDDLE:MOUSE.ROTATE, RIGHT:MOUSE.PAN};
  if (tool === 'drehen') controls.mouseButtons.LEFT = MOUSE.ROTATE;
  if (tool === 'schwenk') controls.mouseButtons.LEFT = MOUSE.PAN;
  if (tool === 'zoom') controls.mouseButtons.LEFT = MOUSE.DOLLY;
}
