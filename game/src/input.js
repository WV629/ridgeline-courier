// Input: keyboard state + edge-triggered actions. Arrow keys / WASD fly,
// W/S throttle, F flaps, G gear, C camera, SPACE action, P pause, M mute,
// R reset sortie, Esc back to menu. Mouse drag orbits the chase camera.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, consumed each frame
    this.dragX = 0;
    this.dragY = 0;
    this.dragging = false;
    this._onKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseDown = (e) => { this.dragging = true; this._lx = e.clientX; this._ly = e.clientY; };
    this._onMouseMove = (e) => {
      if (!this.dragging) return;
      this.dragX += e.clientX - this._lx;
      this.dragY += e.clientY - this._ly;
      this._lx = e.clientX; this._ly = e.clientY;
    };
    this._onMouseUp = () => { this.dragging = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.dragX = 0; this.dragY = 0; }

  // Continuous flight controls, -1..1.
  flight() {
    const k = this.keys;
    let pitch = 0, roll = 0, yaw = 0, throttle = 0;
    if (k.has('ArrowUp') || k.has('KeyW')) pitch += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) pitch -= 1;
    if (k.has('ArrowLeft') || k.has('KeyA')) roll -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) roll += 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) throttle += 1;
    if (k.has('ControlLeft') || k.has('ControlRight')) throttle -= 1;
    if (k.has('KeyQ')) yaw -= 1;
    if (k.has('KeyE')) yaw += 1;
    // WASD doubles as pitch/roll AND throttle is on Shift/Ctrl; that is the
    // documented scheme. Arrow keys are the primary flight controls.
    return { pitch, roll, yaw, throttle };
  }
}
