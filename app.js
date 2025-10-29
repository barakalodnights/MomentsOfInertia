const canvas = document.getElementById('shapeCanvas');
const ctx = canvas.getContext('2d');
const completeBtn = document.getElementById('completeBtn');
const resetBtn = document.getElementById('resetBtn');
const useCentroidBtn = document.getElementById('useCentroidBtn');
const refXInput = document.getElementById('refX');
const refYInput = document.getElementById('refY');
const rotationInput = document.getElementById('rotation');
const mohrCanvas = document.getElementById('mohrCanvas');
const mohrCtx = mohrCanvas ? mohrCanvas.getContext('2d') : null;
const mohrLegend = document.getElementById('mohrLegend');

const areaCell = document.getElementById('areaCell');
const centroidCell = document.getElementById('centroidCell');
const ixCentroidCell = document.getElementById('ixCentroidCell');
const iyCentroidCell = document.getElementById('iyCentroidCell');
const ixyCentroidCell = document.getElementById('ixyCentroidCell');
const ixRefCell = document.getElementById('ixRefCell');
const iyRefCell = document.getElementById('iyRefCell');
const ixyRefCell = document.getElementById('ixyRefCell');
const ixRotCell = document.getElementById('ixRotCell');
const iyRotCell = document.getElementById('iyRotCell');
const ixyRotCell = document.getElementById('ixyRotCell');
const polarCell = document.getElementById('polarCell');

const SCALE = 35;
const MIN_CANVAS_SIZE = 150;
const MAX_CANVAS_SIZE = 240;

let points = [];
let isClosed = false;
let hoverPoint = null;
let metrics = null;
let canvasWidth = canvas.width;
let canvasHeight = canvas.height;
let mohrWidth = mohrCanvas ? mohrCanvas.width : 0;
let mohrHeight = mohrCanvas ? mohrCanvas.height : 0;
let currentMohrData = null;

function mathToScreen(point) {
  return {
    x: canvasWidth / 2 + point.x * SCALE,
    y: canvasHeight / 2 - point.y * SCALE,
  };
}

function screenToMath(x, y) {
  return {
    x: (x - canvasWidth / 2) / SCALE,
    y: (canvasHeight / 2 - y) / SCALE,
  };
}

function resizeCanvas() {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || MAX_CANVAS_SIZE;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || MAX_CANVAS_SIZE;
  const widthFactor = viewportWidth > 1100 ? 0.18 : 0.28;
  const sizeFromWidth = viewportWidth * widthFactor;
  const sizeFromHeight = viewportHeight - 240;

  const sizeCandidates = [MAX_CANVAS_SIZE, sizeFromWidth];
  if (sizeFromHeight > 0) {
    sizeCandidates.push(sizeFromHeight);
  }

  const filteredCandidates = sizeCandidates.filter(Number.isFinite);
  const targetSize = Math.max(
    MIN_CANVAS_SIZE,
    Math.min(...filteredCandidates)
  );

  const roundedSize = Math.round(targetSize);
  canvas.style.width = `${roundedSize}px`;
  canvas.style.height = '';

  let rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    canvas.style.height = `${roundedSize}px`;
    rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
  }

  const dpr = window.devicePixelRatio || 1;
  canvasWidth = rect.width;
  canvasHeight = rect.height;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hoverPoint = null;

  if (metrics) {
    updateOutputs();
  } else {
    draw();
  }
}

function resizeMohrCanvas() {
  if (!mohrCanvas || !mohrCtx) {
    return;
  }

  const rect = mohrCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  mohrWidth = rect.width;
  mohrHeight = rect.height;
  mohrCanvas.width = Math.round(rect.width * dpr);
  mohrCanvas.height = Math.round(rect.height * dpr);
  mohrCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (currentMohrData) {
    drawMohrCircle(currentMohrData);
  } else {
    clearMohrCanvas();
  }
}

function formatNumber(value) {
  if (!isFinite(value)) {
    return '\u2014';
  }
  const rounded = Math.abs(value) < 1e-6 ? 0 : value;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
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

function ensureCounterClockwise() {
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
    IxOrigin,
    IyOrigin,
    IxyOrigin,
    IxCentroid,
    IyCentroid,
    IxyCentroid,
  };
}

function drawAxisWithArrow(origin, direction, lengthUnits, label, color) {
  const norm = Math.hypot(direction.x, direction.y) || 1;
  const unitDir = {
    x: direction.x / norm,
    y: direction.y / norm,
  };

  const negative = {
    x: origin.x - unitDir.x * lengthUnits,
    y: origin.y - unitDir.y * lengthUnits,
  };
  const positive = {
    x: origin.x + unitDir.x * lengthUnits,
    y: origin.y + unitDir.y * lengthUnits,
  };

  const negativeScreen = mathToScreen(negative);
  const positiveScreen = mathToScreen(positive);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(negativeScreen.x, negativeScreen.y);
  ctx.lineTo(positiveScreen.x, positiveScreen.y);
  ctx.stroke();

  const angle = Math.atan2(
    positiveScreen.y - negativeScreen.y,
    positiveScreen.x - negativeScreen.x
  );
  const arrowSize = 9;

  ctx.beginPath();
  ctx.moveTo(positiveScreen.x, positiveScreen.y);
  ctx.lineTo(
    positiveScreen.x - arrowSize * Math.cos(angle - Math.PI / 8),
    positiveScreen.y - arrowSize * Math.sin(angle - Math.PI / 8)
  );
  ctx.lineTo(
    positiveScreen.x - arrowSize * Math.cos(angle + Math.PI / 8),
    positiveScreen.y - arrowSize * Math.sin(angle + Math.PI / 8)
  );
  ctx.closePath();
  ctx.fill();

  ctx.font = '13px Segoe UI';
  ctx.fillText(label, positiveScreen.x + 6, positiveScreen.y - 6);
  ctx.restore();
}

function drawRotatedAxes(origin, theta) {
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const maxSpanUnits = Math.min(canvasWidth, canvasHeight) / SCALE;
  const axisLengthUnits = Math.max(
    1.5,
    Math.min(4, maxSpanUnits / 2)
  );

  drawAxisWithArrow(
    origin,
    { x: cosTheta, y: sinTheta },
    axisLengthUnits,
    "x'",
    '#0ea5e9'
  );
  drawAxisWithArrow(
    origin,
    { x: -sinTheta, y: cosTheta },
    axisLengthUnits,
    "y'",
    '#f97316'
  );
}

function clearMohrCanvas() {
  if (!mohrCtx) {
    return;
  }
  if (!mohrWidth || !mohrHeight) {
    const rect = mohrCanvas.getBoundingClientRect();
    mohrWidth = rect.width || mohrCanvas.width;
    mohrHeight = rect.height || mohrCanvas.height;
  }
  mohrCtx.clearRect(0, 0, mohrWidth, mohrHeight);
  mohrCtx.save();
  mohrCtx.fillStyle = '#9ca3af';
  mohrCtx.font = '13px Segoe UI';
  mohrCtx.textAlign = 'center';
  mohrCtx.fillText('Awaiting polygon...', mohrWidth / 2, mohrHeight / 2);
  mohrCtx.restore();
}

function drawMohrCircle(data) {
  if (!mohrCtx || !data) {
    return;
  }

  if (!mohrWidth || !mohrHeight) {
    const rect = mohrCanvas.getBoundingClientRect();
    if (rect.width && rect.height) {
      mohrWidth = rect.width;
      mohrHeight = rect.height;
    } else {
      return;
    }
  }

  mohrCtx.clearRect(0, 0, mohrWidth, mohrHeight);

  const width = mohrWidth;
  const height = mohrHeight;
  const padding = 28;
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const axisColor = prefersDark ? '#475569' : '#d1d5db';
  const connectorColor = prefersDark ? '#64748b' : '#9ca3af';
  const axisTextColor = prefersDark ? '#cbd5f5' : '#4b5563';
  const principalColor = '#facc15';
  const centerScreen = {
    x: width / 2,
    y: height / 2,
  };
  const availableRadius = Math.max(10, Math.min(width, height) / 2 - padding);
  const radius = Math.abs(data.radius);
  const effectiveRadius = radius < 1e-9 ? 0 : radius;
  const scale = effectiveRadius === 0 ? availableRadius : availableRadius / effectiveRadius;
  const drawnRadius = effectiveRadius === 0 ? 6 : radius * scale;

  mohrCtx.save();
  mohrCtx.strokeStyle = axisColor;
  mohrCtx.lineWidth = 1;
  mohrCtx.beginPath();
  mohrCtx.moveTo(padding / 2, centerScreen.y);
  mohrCtx.lineTo(width - padding / 2, centerScreen.y);
  mohrCtx.stroke();
  mohrCtx.beginPath();
  mohrCtx.moveTo(centerScreen.x, padding / 2);
  mohrCtx.lineTo(centerScreen.x, height - padding / 2);
  mohrCtx.stroke();
  mohrCtx.restore();

  mohrCtx.save();
  mohrCtx.strokeStyle = '#2563eb';
  mohrCtx.lineWidth = 1.8;
  mohrCtx.beginPath();
  mohrCtx.arc(centerScreen.x, centerScreen.y, drawnRadius, 0, Math.PI * 2);
  mohrCtx.stroke();
  mohrCtx.restore();

  const project = (IValue, JValue) => ({
    x: centerScreen.x + (IValue - data.center) * scale,
    y: centerScreen.y - JValue * scale,
  });

  const pointX = project(data.IxRef, -data.IxyRef);
  const pointY = project(data.IyRef, data.IxyRef);
  const pointRot = project(data.IxRot, -data.IxyRot);
  const pointPrincipalMax = project(data.principalMax, 0);
  const pointPrincipalMin = project(data.principalMin, 0);

  mohrCtx.save();
  mohrCtx.strokeStyle = connectorColor;
  mohrCtx.lineWidth = 1;
  mohrCtx.beginPath();
  mohrCtx.moveTo(pointX.x, pointX.y);
  mohrCtx.lineTo(pointY.x, pointY.y);
  mohrCtx.stroke();
  mohrCtx.restore();

  mohrCtx.save();
  mohrCtx.strokeStyle = '#10b981';
  mohrCtx.lineWidth = 1;
  mohrCtx.beginPath();
  mohrCtx.moveTo(centerScreen.x, centerScreen.y);
  mohrCtx.lineTo(pointRot.x, pointRot.y);
  mohrCtx.stroke();
  mohrCtx.restore();

  const drawMohrPoint = (pos, color, label, offsetY = -6) => {
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      return;
    }
    mohrCtx.save();
    mohrCtx.fillStyle = color;
    mohrCtx.beginPath();
    mohrCtx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    mohrCtx.fill();
    mohrCtx.font = '12px Segoe UI';
    mohrCtx.fillText(label, pos.x + 6, pos.y + offsetY);
    mohrCtx.restore();
  };

  drawMohrPoint(pointX, '#f87171', 'Ix', -8);
  drawMohrPoint(pointY, '#3b82f6', 'Iy', 14);
  drawMohrPoint(pointRot, '#10b981', "Ix'", -8);
  drawMohrPoint(pointPrincipalMax, principalColor, 'I1', -10);
  drawMohrPoint(pointPrincipalMin, principalColor, 'I2', 14);

  mohrCtx.save();
  mohrCtx.fillStyle = axisTextColor;
  mohrCtx.font = '11px Segoe UI';
  mohrCtx.fillText(`Center = ${formatNumber(data.center)}`, centerScreen.x + 8, centerScreen.y + 16);
  mohrCtx.fillText(`Radius = ${formatNumber(radius)}`, centerScreen.x + 8, centerScreen.y + 30);
  mohrCtx.restore();
}

function updateOutputs() {
  if (!metrics) {
    areaCell.innerHTML = '&mdash;';
    centroidCell.innerHTML = '&mdash;';
    ixCentroidCell.innerHTML = '&mdash;';
    iyCentroidCell.innerHTML = '&mdash;';
    ixyCentroidCell.innerHTML = '&mdash;';
    ixRefCell.innerHTML = '&mdash;';
    iyRefCell.innerHTML = '&mdash;';
    ixyRefCell.innerHTML = '&mdash;';
    ixRotCell.innerHTML = '&mdash;';
    iyRotCell.innerHTML = '&mdash;';
    ixyRotCell.innerHTML = '&mdash;';
    polarCell.innerHTML = '&mdash;';
    currentMohrData = null;
    if (mohrLegend) {
      mohrLegend.textContent = "Add a closed shape to view Mohr's circle.";
    }
    clearMohrCanvas();
    draw();
    return;
  }

  const { area, centroid, IxCentroid, IyCentroid, IxyCentroid } = metrics;
  const refX = Number(refXInput.value) || 0;
  const refY = Number(refYInput.value) || 0;
  const rotationDegrees = Number(rotationInput.value) || 0;

  const dx = refX - centroid.x;
  const dy = refY - centroid.y;

  const IxRef = IxCentroid + area * dy * dy;
  const IyRef = IyCentroid + area * dx * dx;
  const IxyRef = IxyCentroid + area * dx * dy;

  const theta = (rotationDegrees * Math.PI) / 180;
  const cos2 = Math.cos(2 * theta);
  const sin2 = Math.sin(2 * theta);

  const mohrCenter = (IxRef + IyRef) / 2;
  const diff = (IxRef - IyRef) / 2;
  const IxRot = mohrCenter + diff * cos2 - IxyRef * sin2;
  const IyRot = mohrCenter - diff * cos2 + IxyRef * sin2;
  const IxyRot = diff * sin2 + IxyRef * Math.cos(2 * theta);

  areaCell.textContent = `${formatNumber(area)} (units^2)`;
  centroidCell.textContent = `(${formatNumber(centroid.x)}, ${formatNumber(centroid.y)})`;
  ixCentroidCell.textContent = `${formatNumber(Math.abs(IxCentroid))} (units^4)`;
  iyCentroidCell.textContent = `${formatNumber(Math.abs(IyCentroid))} (units^4)`;
  ixyCentroidCell.textContent = `${formatNumber(IxyCentroid)} (units^4)`;
  ixRefCell.textContent = `${formatNumber(Math.abs(IxRef))} (units^4)`;
  iyRefCell.textContent = `${formatNumber(Math.abs(IyRef))} (units^4)`;
  ixyRefCell.textContent = `${formatNumber(IxyRef)} (units^4)`;
  ixRotCell.textContent = `${formatNumber(Math.abs(IxRot))} (units^4)`;
  iyRotCell.textContent = `${formatNumber(Math.abs(IyRot))} (units^4)`;
  ixyRotCell.textContent = `${formatNumber(IxyRot)} (units^4)`;
  polarCell.textContent = `${formatNumber(Math.abs(IxCentroid + IyCentroid))} (units^4)`;

  const mohrRadius = Math.sqrt(Math.max(0, diff * diff + IxyRef * IxyRef));
  const principalMax = mohrCenter + mohrRadius;
  const principalMin = mohrCenter - mohrRadius;
  currentMohrData = {
    center: mohrCenter,
    radius: mohrRadius,
    IxRef,
    IyRef,
    IxyRef,
    IxRot,
    IxyRot,
    principalMax,
    principalMin,
  };
  drawMohrCircle(currentMohrData);
  if (mohrLegend) {
    mohrLegend.textContent = `Principal inertias: I1 = ${formatNumber(principalMax)}, I2 = ${formatNumber(principalMin)} (units^4)`;
  }

  draw();
}

function drawAxes() {
  ctx.save();
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, canvasHeight / 2);
  ctx.lineTo(canvasWidth, canvasHeight / 2);
  ctx.moveTo(canvasWidth / 2, 0);
  ctx.lineTo(canvasWidth / 2, canvasHeight);
  ctx.stroke();

  ctx.font = '12px Segoe UI';
  ctx.fillStyle = '#9ca3af';
  ctx.fillText('x', canvasWidth - 16, canvasHeight / 2 - 6);
  ctx.fillText('y', canvasWidth / 2 + 6, 12);
  ctx.restore();
}

function drawGrid() {
  const spacing = SCALE;
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1;

  for (let x = canvasWidth / 2; x < canvasWidth; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
  }
  for (let x = canvasWidth / 2; x >= 0; x -= spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
  }
  for (let y = canvasHeight / 2; y < canvasHeight; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();
  }
  for (let y = canvasHeight / 2; y >= 0; y -= spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  drawGrid();
  drawAxes();

  const refPoint = {
    x: Number(refXInput.value) || 0,
    y: Number(refYInput.value) || 0,
  };
  const rotationDegrees = Number(rotationInput.value) || 0;
  const theta = (rotationDegrees * Math.PI) / 180;

  if (points.length > 0) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2563eb';
    ctx.fillStyle = 'rgba(37, 99, 235, 0.2)';

    ctx.beginPath();
    const first = mathToScreen(points[0]);
    ctx.moveTo(first.x, first.y);

    for (let i = 1; i < points.length; i++) {
      const screen = mathToScreen(points[i]);
      ctx.lineTo(screen.x, screen.y);
    }

    if (isClosed) {
      ctx.closePath();
      ctx.fill();
    } else if (hoverPoint) {
      ctx.lineTo(hoverPoint.x, hoverPoint.y);
    }

    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#ef4444';
    for (const point of points) {
      const screen = mathToScreen(point);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (metrics) {
    const centroidScreen = mathToScreen(metrics.centroid);
    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    const size = 8;
    ctx.beginPath();
    ctx.moveTo(centroidScreen.x - size, centroidScreen.y);
    ctx.lineTo(centroidScreen.x + size, centroidScreen.y);
    ctx.moveTo(centroidScreen.x, centroidScreen.y - size);
    ctx.lineTo(centroidScreen.x, centroidScreen.y + size);
    ctx.stroke();
    ctx.font = '14px Segoe UI';
    ctx.fillText('C', centroidScreen.x + 6, centroidScreen.y - 8);
    ctx.restore();
  }

  drawRotatedAxes(refPoint, theta);

  const refScreen = mathToScreen(refPoint);
  ctx.save();
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(refScreen.x, refScreen.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '14px Segoe UI';
  ctx.fillText('Ref', refScreen.x + 6, refScreen.y - 6);
  ctx.restore();
}

function addPoint(event) {
  if (isClosed) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const mathPoint = screenToMath(x, y);

  if (points.length >= 3) {
    const firstScreen = mathToScreen(points[0]);
    const distanceToFirst = Math.hypot(x - firstScreen.x, y - firstScreen.y);
    if (distanceToFirst < 12) {
      completeShape();
      return;
    }
  }

  points.push(mathPoint);
  completeBtn.disabled = points.length < 3;
  draw();
}

function completeShape() {
  if (points.length < 3 || isClosed) {
    return;
  }

  ensureCounterClockwise();
  metrics = computeProperties(points);
  if (!metrics) {
    window.alert('The shape needs a non-zero area. Please adjust the vertices.');
    return;
  }

  isClosed = true;
  useCentroidBtn.disabled = false;
  completeBtn.disabled = true;
  updateOutputs();
}

function resetCanvas() {
  points = [];
  metrics = null;
  isClosed = false;
  hoverPoint = null;
  completeBtn.disabled = true;
  useCentroidBtn.disabled = true;
  updateOutputs();
  draw();
}

canvas.addEventListener('mousedown', addPoint);
canvas.addEventListener('dblclick', (event) => {
  event.preventDefault();
  completeShape();
});

canvas.addEventListener('mousemove', (event) => {
  if (isClosed || points.length === 0) {
    hoverPoint = null;
    draw();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  hoverPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  draw();
});

canvas.addEventListener('mouseleave', () => {
  hoverPoint = null;
  draw();
});

completeBtn.addEventListener('click', completeShape);
resetBtn.addEventListener('click', resetCanvas);

useCentroidBtn.addEventListener('click', () => {
  if (!metrics) {
    return;
  }
  refXInput.value = metrics.centroid.x.toFixed(3);
  refYInput.value = metrics.centroid.y.toFixed(3);
  updateOutputs();
});

refXInput.addEventListener('input', updateOutputs);
refYInput.addEventListener('input', updateOutputs);
rotationInput.addEventListener('input', updateOutputs);

window.addEventListener('resize', () => {
  resizeCanvas();
  resizeMohrCanvas();
});

resizeCanvas();
resizeMohrCanvas();
resetCanvas();
