// SPEC-D4 ASCII level parser. '#' = solid, '.' = empty, 'S' = spawn, 'G' = goal, 'E' = enemy.
// Out-of-bounds tiles are treated as SOLID (confining convention).

export function parseLevel(rows) {
  const map = rows.slice();
  const height = map.length;
  const width = height > 0 ? map[0].length : 0;
  let spawn = null;
  let goal = null;
  const enemies = [];

  for (let ty = 0; ty < height; ty++) {
    const row = map[ty];
    for (let tx = 0; tx < row.length; tx++) {
      const ch = row[tx];
      if (ch === 'S' && !spawn) spawn = { tx, ty };
      if (ch === 'G' && !goal) goal = { tx, ty };
      if (ch === 'E') enemies.push({ tx, ty });
    }
  }

  return {
    rows: map,
    width,
    height,
    spawn,
    goal,
    enemies,
    solidAt(tx, ty) {
      return (map[ty]?.[tx] ?? '#') === '#';
    }
  };
}
