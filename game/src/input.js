// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. The game asks the canvas for pointer lock and reads
// movementX/Y while it holds it. Buy-menu and weapon keys are plain codes the
// main loop reads from the same set.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (down) keys.add(event.code);
    else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => {
    setKey(event, true);
    // Repeat keydown events must not re-trigger single-press actions.
    if (event.repeat) return;
    if (event.code === 'KeyB') state.buyPressed = true;
    if (event.code === 'KeyG') state.grenadePressed = true;
    if (event.code === 'Digit1') state.slotPressed = 1;
    if (event.code === 'Digit2') state.slotPressed = 2;
    if (event.code === 'Digit3') state.slotPressed = 3;
    if (event.code === 'Digit4') state.slotPressed = 4;
    if (event.code === 'KeyM') state.mutePressed = true;
  });
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // Single-press flags: the main loop reads them once per tick, then clears.
    takePresses() {
      const out = {
        buy: !!state.buyPressed,
        grenade: !!state.grenadePressed,
        slot: state.slotPressed || 0,
        mute: !!state.mutePressed,
      };
      state.buyPressed = false;
      state.grenadePressed = false;
      state.slotPressed = 0;
      state.mutePressed = false;
      return out;
    },
  };
}
