function actionFor(code) {
  switch (code) {
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'KeyZ': return 'jump';
    case 'KeyX': return 'fire';
    case 'KeyC': return 'slide';
    default: return null;
  }
}

export function createInput(target = window) {
  const held = { left: false, right: false, jump: false, fire: false, slide: false };

  target.addEventListener('keydown', (e) => {
    const a = actionFor(e.code);
    if (a) { held[a] = true; e.preventDefault(); }
  });

  target.addEventListener('keyup', (e) => {
    const a = actionFor(e.code);
    if (a) { held[a] = false; e.preventDefault(); }
  });

  return {
    sample() {
      return {
        left: held.left,
        right: held.right,
        jump: held.jump,
        fire: held.fire,
        slide: held.slide
      };
    }
  };
}
