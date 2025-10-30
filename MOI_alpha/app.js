(() => {
const shapeLabels = ['A', 'B'];

const momentSlider = document.getElementById('momentSlider');
const momentInput = document.getElementById('momentInput');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetMotionBtn = document.getElementById('resetMotionBtn');
const statusMessage = document.getElementById('statusMessage');

const SCALE = 65;
const CLOSE_DISTANCE_PX = 12;
const MAX_TIME_STEP = 0.05;
const MAX_ANGULAR_SPEED = 60; // rad/s safety cap

let appliedMoment = Number(momentSlider.value) || 0;
let isAnimating = false;
let animationId = null;
let lastTimestamp = null;

const shapeStates = shapeLabels.reduce((acc, label) => {
  acc[label] = createShapeState(label);
  return acc;
}, {});

function createShapeState(label) {
  const canvas = document.getElementById(`shapeCanvas${label}`);
  const state = {
    label,
    canvas,
    ctx: canvas.getContext('2d'),
    completeBtn: document.getElementById(`completeBtn${label}`),
    resetBtn: document.getElementById(`resetShapeBtn${label}`),
    izzDisplay: document.getElementById(`izzDisplay${label}`),
    alphaDisplay: document.getElementById(`alphaDisplay${label}`),
    omegaDisplay: document.getElementById(`omegaDisplay${label}`),
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    points: [],
    hoverPoint: null,
    isClosed: false,
    metrics: null,
    rotationAngle: 0,
    angularVelocity: 0,
  };
  setupCanvasInteractions(state);
  setupButtons(state);
  resizeCanvas(state);
  return state;
}

function setupCanvasInteractions(state) {
  state.canvas.addEventListener('mousedown', (event) => addPoint(state, event));
  state.canvas.addEventListener('mousemove', (event) => handleMouseMove(state, event));
  state.canvas.addEventListener('mouseleave', () => handleMouseLeave(state));
  state.canvas.addEventListener('dblclick', (event) => {
    event.preventDefault();
    completeShape(state);
  });
}

function setupButtons(state) {
  state.completeBtn.addEventListener('click', () => completeShape(state));
  state.resetBtn.addEventListener('click', () => resetShape(state));
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return '--';
  }
  const rounded = Math.abs(value) < 1e-10 ? 0 : value;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function mathToScreen(state, point) {
  return {
    x: state.canvasWidth / 2 + point.x * SCALE,
    y: state.canvasHeight / 2 - point.y * SCALE,
  };
}

function screenToMath(state, x, y) {
  return {
    x: (x - state.canvasWidth / 2) / SCALE,
    y: (state.canvasHeight / 2 - y) / SCALE,
  };
}

function computeSignedArea(pts) {
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const current = pts[i];
    const next = pts[(i + 1) % pts.length];
    area2 += current.x * next.y - next.x * current.y;
  }
  return area2 / 2;
}

function ensureCounterClockwise(points) {
  if (points.length < 3) {
    return;
  }
  if (computeSignedArea(points) < 0) {
    points.reverse();
  }
}

function computeProperties(pts) {
  if (pts.length < 3) {
    return null;
  }

  let areaTimesTwo = 0;
  let centroidXTimesSixA = 0;
  let centroidYTimesSixA = 0;
  let IxSum = 0;
  let IySum = 0;
  let IxySum = 0;

  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const cross = p0.x * p1.y - p1.x * p0.y;

    areaTimesTwo += cross;
    centroidXTimesSixA += (p0.x + p1.x) * cross;
    centroidYTimesSixA += (p0.y + p1.y) * cross;

    IxSum += (p0.y * p0.y + p0.y * p1.y + p1.y * p1.y) * cross;
    IySum += (p0.x * p0.x + p0.x * p1.x + p1.x * p1.x) * cross;
    IxySum += (2 * p0.x * p0.y + p0.x * p1.y + p1.x * p0.y + 2 * p1.x * p1.y) * cross;
  }

  const area = areaTimesTwo / 2;
  if (Math.abs(area) < 1e-8) {
    return null;
  }

  const centroid = {
    x: centroidXTimesSixA / (3 * areaTimesTwo),
    y: centroidYTimesSixA / (3 * areaTimesTwo),
  };

  const IxOrigin = IxSum / 12;
  const IyOrigin = IySum / 12;
  const IxyOrigin = IxySum / 24;

  const IxCentroid = IxOrigin - area * centroid.y * centroid.y;
  const IyCentroid = IyOrigin - area * centroid.x * centroid.x;
  const IxyCentroid = IxyOrigin - area * centroid.x * centroid.y;

  return {
    area,
    centroid,
    IxCentroid,
    IyCentroid,
    IxyCentroid,
  };
}

function rotatePoint(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function getRotatedPoints(state) {
  if (!state.points.length) {
    return [];
  }
  const cos = Math.cos(state.rotationAngle);
  const sin = Math.sin(state.rotationAngle);
  return state.points.map((pt) => ({
    x: pt.x * cos - pt.y * sin,
    y: pt.x * sin + pt.y * cos,
  }));
}

function drawGrid(state) {
  const ctx = state.ctx;
  ctx.save();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);

  const maxX = Math.ceil((state.canvasWidth / 2) / SCALE);
  const maxY = Math.ceil((state.canvasHeight / 2) / SCALE);

  for (let i = -maxX; i <= maxX; i++) {
    if (i === 0) {
      continue;
    }
    const screen = mathToScreen(state, { x: i, y: 0 });
    ctx.beginPath();
    ctx.moveTo(screen.x, 0);
    ctx.lineTo(screen.x, state.canvasHeight);
    ctx.stroke();
  }

  for (let j = -maxY; j <= maxY; j++) {
    if (j === 0) {
      continue;
    }
    const screen = mathToScreen(state, { x: 0, y: j });
    ctx.beginPath();
    ctx.moveTo(0, screen.y);
    ctx.lineTo(state.canvasWidth, screen.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAxes(state) {
  const ctx = state.ctx;
  const origin = mathToScreen(state, { x: 0, y: 0 });
  ctx.save();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(state.canvasWidth, origin.y);
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, state.canvasHeight);
  ctx.stroke();

  ctx.fillStyle = '#1f2937';
  ctx.font = '12px Segoe UI';
  ctx.fillText('x', state.canvasWidth - 14, origin.y - 6);
  ctx.fillText('y', origin.x + 6, 14);
  ctx.restore();
}

function drawPolygon(state, vertices, closed, highlight = false) {
  if (vertices.length === 0) {
    return;
  }

  const ctx = state.ctx;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = highlight ? '#dc2626' : '#2563eb';
  ctx.fillStyle = closed
    ? highlight
      ? 'rgba(220, 38, 38, 0.25)'
      : 'rgba(37, 99, 235, 0.18)'
    : 'transparent';

  const first = mathToScreen(state, vertices[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < vertices.length; i++) {
    const screen = mathToScreen(state, vertices[i]);
    ctx.lineTo(screen.x, screen.y);
  }
  if (closed) {
    ctx.closePath();
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}

function drawVertices(state, vertices, highlight = false) {
  const ctx = state.ctx;
  ctx.save();
  ctx.fillStyle = highlight ? '#b91c1c' : '#1d4ed8';
  vertices.forEach((pt) => {
    const screen = mathToScreen(state, pt);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawHoverPreview(state) {
  if (!state.hoverPoint || state.points.length === 0 || state.isClosed) {
    return;
  }
  const ctx = state.ctx;
  ctx.save();
  ctx.strokeStyle = '#1d4ed8';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  const last = mathToScreen(state, state.points[state.points.length - 1]);
  const hoverScreen = mathToScreen(state, state.hoverPoint);
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(hoverScreen.x, hoverScreen.y);
  ctx.stroke();

  if (state.points.length >= 2) {
    const first = mathToScreen(state, state.points[0]);
    ctx.beginPath();
    ctx.moveTo(hoverScreen.x, hoverScreen.y);
    ctx.lineTo(first.x, first.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCentroidMarker(state) {
  if (!state.metrics) {
    return;
  }
  const ctx = state.ctx;
  const rotatedCentroid = rotatePoint(state.metrics.centroid, state.rotationAngle);
  const center = mathToScreen(state, rotatedCentroid);
  ctx.save();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  const size = 10;
  ctx.beginPath();
  ctx.moveTo(center.x - size, center.y);
  ctx.lineTo(center.x + size, center.y);
  ctx.moveTo(center.x, center.y - size);
  ctx.lineTo(center.x, center.y + size);
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '13px Segoe UI';
  ctx.fillText('C', center.x + 6, center.y - 6);
  ctx.restore();
}

function drawMomentIndicator(state) {
  if (!state.metrics || appliedMoment === 0) {
    return;
  }
  const ctx = state.ctx;
  const center = mathToScreen(state, { x: 0, y: 0 });
  const radius = Math.min(state.canvasWidth, state.canvasHeight) * 0.18;
  const momentSign = appliedMoment >= 0 ? 1 : -1;
  const direction = -momentSign;
  const magnitudeRatio = Math.min(Math.abs(appliedMoment) / 5, 1);
  const sweep = Math.PI / 3 + magnitudeRatio * Math.PI * 0.9;
  const startAngle = -Math.PI / 2;
  const endAngle = direction >= 0 ? startAngle + sweep : startAngle - sweep;

  ctx.save();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, startAngle, endAngle, direction < 0);
  ctx.stroke();

  const tipX = center.x + radius * Math.cos(endAngle);
  const tipY = center.y + radius * Math.sin(endAngle);
  const headSize = 12;
  const tangentAngle = endAngle + direction * Math.PI / 2;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - headSize * Math.cos(tangentAngle - Math.PI / 6),
    tipY - headSize * Math.sin(tangentAngle - Math.PI / 6)
  );
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - headSize * Math.cos(tangentAngle + Math.PI / 6),
    tipY - headSize * Math.sin(tangentAngle + Math.PI / 6)
  );
  ctx.stroke();

  ctx.fillStyle = '#b45309';
  ctx.font = '12px Segoe UI';
  ctx.fillText(momentSign >= 0 ? 'CCW' : 'CW', center.x + radius + 8, center.y - 6);
  ctx.restore();
}

function drawState(state) {
  state.ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
  drawGrid(state);
  drawAxes(state);

  if (state.points.length > 0 || state.isClosed) {
    const vertices = state.isClosed ? getRotatedPoints(state) : state.points;
    const atLimit = state.isClosed && Math.abs(state.angularVelocity) >= MAX_ANGULAR_SPEED - 1e-6;
    drawPolygon(state, vertices, state.isClosed, atLimit);
    drawVertices(state, vertices, atLimit);
  }

  if (!state.isClosed) {
    drawHoverPreview(state);
  } else {
    drawCentroidMarker(state);
    drawMomentIndicator(state);
  }
}

function drawAll() {
  shapeLabels.forEach((label) => {
    drawState(shapeStates[label]);
  });
}

function computeAlpha(state) {
  if (!state.metrics || state.metrics.IzzOrigin <= 1e-9) {
    return null;
  }
  return appliedMoment / state.metrics.IzzOrigin;
}

function updateShapeInfo(state) {
  if (!state.metrics) {
    state.izzDisplay.textContent = '-- units^4';
    state.alphaDisplay.textContent = '-- rad/s^2';
  } else {
    const alpha = computeAlpha(state);
    state.izzDisplay.textContent = `${formatNumber(state.metrics.IzzOrigin, 3)} units^4`;
    state.alphaDisplay.textContent = alpha === null ? '-- rad/s^2' : `${formatNumber(alpha, 2)} rad/s^2`;
  }

  const omegaValue = formatNumber(state.angularVelocity, 2);
  state.omegaDisplay.textContent = `${omegaValue} rad/s`;
  const atLimit = Math.abs(state.angularVelocity) >= MAX_ANGULAR_SPEED - 1e-6;
  state.omegaDisplay.classList.toggle('highlighted', atLimit);
}

function updateInfoPanel() {
  shapeLabels.forEach((label) => updateShapeInfo(shapeStates[label]));
}

function areShapesClosed() {
  return shapeLabels.every((label) => shapeStates[label].isClosed);
}

function areShapesReady() {
  return shapeLabels.every((label) => {
    const state = shapeStates[label];
    return state.metrics && state.metrics.IzzOrigin > 1e-9;
  });
}

function updateStatus() {
  if (!areShapesClosed()) {
    statusMessage.textContent = 'Complete both shapes to compute their centroids and inertia.';
    return;
  }
  if (!areShapesReady()) {
    statusMessage.textContent = 'Each shape must enclose a non-zero area. Reset and adjust any invalid shape.';
    return;
  }
  if (isAnimating) {
    const alphaA = computeAlpha(shapeStates.A);
    const alphaB = computeAlpha(shapeStates.B);
    statusMessage.textContent = `Animating: alpha_A = ${formatNumber(alphaA, 2)} rad/s^2, alpha_B = ${formatNumber(alphaB, 2)} rad/s^2.`;
    return;
  }
  statusMessage.textContent = 'Shapes ready. Rotation occurs about the origin. Adjust M (-5 to 5 N*m) and press Play to compare the rotations.';
}

function updateButtonStates() {
  shapeLabels.forEach((label) => {
    const state = shapeStates[label];
    state.completeBtn.disabled = state.isClosed || state.points.length < 3;
  });
  playBtn.disabled = !areShapesReady() || isAnimating;
  pauseBtn.disabled = !isAnimating;
}

function resetMotion() {
  pauseAnimation();
  shapeLabels.forEach((label) => {
    const state = shapeStates[label];
    state.angularVelocity = 0;
    state.rotationAngle = 0;
  });
  lastTimestamp = null;
  updateInfoPanel();
  updateStatus();
  drawAll();
}

function resetShape(state) {
  pauseAnimation();
  state.points = [];
  state.hoverPoint = null;
  state.isClosed = false;
  state.metrics = null;
  state.rotationAngle = 0;
  state.angularVelocity = 0;
  state.completeBtn.disabled = true;
  updateInfoPanel();
  updateButtonStates();
  updateStatus();
  drawAll();
}

function startAnimation() {
  if (!areShapesReady() || isAnimating) {
    updateStatus();
    return;
  }
  isAnimating = true;
  lastTimestamp = null;
  updateButtonStates();
  updateStatus();
  animationId = requestAnimationFrame(stepAnimation);
}

function pauseAnimation() {
  if (!isAnimating) {
    return;
  }
  isAnimating = false;
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  updateButtonStates();
  updateStatus();
}

function stepAnimation(timestamp) {
  if (!isAnimating) {
    return;
  }
  if (lastTimestamp === null) {
    lastTimestamp = timestamp;
    animationId = requestAnimationFrame(stepAnimation);
    return;
  }

  const delta = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  const dt = Math.min(delta, MAX_TIME_STEP);

  shapeLabels.forEach((label) => {
    const state = shapeStates[label];
    if (!state.metrics || state.metrics.IzzOrigin <= 1e-9) {
      return;
    }
    const alpha = computeAlpha(state) || 0;
    state.angularVelocity += alpha * dt;
    state.angularVelocity = Math.max(Math.min(state.angularVelocity, MAX_ANGULAR_SPEED), -MAX_ANGULAR_SPEED);
    state.rotationAngle += state.angularVelocity * dt;
  });

  updateInfoPanel();
  updateStatus();
  drawAll();
  animationId = requestAnimationFrame(stepAnimation);
}

function syncMoment(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return;
  }
  const min = Number(momentSlider.min);
  const max = Number(momentSlider.max);
  appliedMoment = Math.max(min, Math.min(max, numeric));
  momentSlider.value = appliedMoment;
  momentInput.value = appliedMoment;
  updateInfoPanel();
  updateStatus();
  drawAll();
}

function completeShape(state) {
  if (state.isClosed || state.points.length < 3) {
    return;
  }
  ensureCounterClockwise(state.points);
  const props = computeProperties(state.points);
  if (!props) {
    statusMessage.textContent = `Shape ${state.label} must enclose a non-zero area. Adjust the vertices and try again.`;
    return;
  }

  const area = Math.abs(props.area);
  const cx = props.centroid.x;
  const cy = props.centroid.y;
  const IzzCentroid = props.IxCentroid + props.IyCentroid;
  const IzzOrigin = IzzCentroid + area * (cx * cx + cy * cy);

  state.metrics = {
    area,
    centroid: props.centroid,
    IxCentroid: props.IxCentroid,
    IyCentroid: props.IyCentroid,
    IxyCentroid: props.IxyCentroid,
    IzzCentroid,
    IzzOrigin,
  };

  state.isClosed = true;
  state.hoverPoint = null;
  state.rotationAngle = 0;
  state.angularVelocity = 0;
  updateInfoPanel();
  updateButtonStates();
  updateStatus();
  drawAll();
}

function addPoint(state, event) {
  if (state.isClosed) {
    return;
  }

  const rect = state.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const mathPoint = screenToMath(state, x, y);

  if (state.points.length >= 3) {
    const firstScreen = mathToScreen(state, state.points[0]);
    const distanceToFirst = Math.hypot(x - firstScreen.x, y - firstScreen.y);
    if (distanceToFirst <= CLOSE_DISTANCE_PX) {
      completeShape(state);
      return;
    }
  }

  state.points.push(mathPoint);
  state.completeBtn.disabled = state.points.length < 3;
  updateButtonStates();
  drawAll();
}

function handleMouseMove(state, event) {
  if (state.isClosed || state.points.length === 0) {
    if (state.hoverPoint) {
      state.hoverPoint = null;
      drawAll();
    }
    return;
  }
  const rect = state.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  state.hoverPoint = screenToMath(state, x, y);
  drawAll();
}

function handleMouseLeave(state) {
  if (state.hoverPoint) {
    state.hoverPoint = null;
    drawAll();
  }
}

function resizeCanvas(state) {
  const rect = state.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  state.canvasWidth = rect.width;
  state.canvasHeight = rect.height;
  state.canvas.width = Math.round(rect.width * dpr);
  state.canvas.height = Math.round(rect.height * dpr);
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

playBtn.addEventListener('click', startAnimation);
pauseBtn.addEventListener('click', pauseAnimation);
resetMotionBtn.addEventListener('click', resetMotion);

momentSlider.addEventListener('input', () => syncMoment(momentSlider.value));
momentInput.addEventListener('input', () => syncMoment(momentInput.value));

window.addEventListener('resize', () => {
  shapeLabels.forEach((label) => resizeCanvas(shapeStates[label]));
  drawAll();
});

function initialize() {
  updateInfoPanel();
  updateButtonStates();
  updateStatus();
  drawAll();
}

initialize();

window.DynamicsExplorer = {
  activate() {
    shapeLabels.forEach((label) => resizeCanvas(shapeStates[label]));
    drawAll();
    updateInfoPanel();
    updateStatus();
  },
};

})();
