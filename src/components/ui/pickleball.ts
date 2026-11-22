const points = Array.from({ length: 26 }, (_, i) => {
  const y = 1 - ((i + 0.5) * 2) / 26, r = Math.sqrt(1 - y * y), theta = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
});

export function drawPickleball(ctx: CanvasRenderingContext2D, angle: number) {
  const SIZE = 72, R = 29, C = SIZE / 2;
  const cosT = Math.cos(0.4), sinT = Math.sin(0.4);
  ctx.clearRect(0, 0, SIZE, SIZE);
  const body = ctx.createRadialGradient(C - 9, C - 11, 3, C, C, R);
  body.addColorStop(0, "#ffd9a0"); body.addColorStop(0.6, "#ffad4c"); body.addColorStop(1, "#e8890f");
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.fill();
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  for (const [x, y, z] of points) {
    const x1 = x * cosA + z * sinA, z1 = -x * sinA + z * cosA;
    const y2 = y * cosT - z1 * sinT, z2 = y * sinT + z1 * cosT;
    if (z2 <= 0.04) continue;
    ctx.save(); ctx.translate(C + x1 * R, C - y2 * R); ctx.rotate(Math.atan2(-y2, x1));
    ctx.fillStyle = "rgba(22,56,77,.85)"; ctx.beginPath(); ctx.ellipse(0, 0, 3.6 * z2, 3.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const shade = ctx.createRadialGradient(C - 9, C - 11, 2, C, C, R);
  shade.addColorStop(0, "rgba(255,255,255,.45)"); shade.addColorStop(0.35, "rgba(255,255,255,0)"); shade.addColorStop(0.75, "rgba(0,0,0,0)"); shade.addColorStop(1, "rgba(0,0,0,.3)");
  ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.fill();
}
