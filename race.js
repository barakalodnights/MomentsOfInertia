(() => {
  const rampLengthSlider = document.getElementById('rampLengthSlider');
  const rampLengthInput = document.getElementById('rampLengthInput');
  const rampAngleSlider = document.getElementById('rampAngleSlider');
  const rampAngleInput = document.getElementById('rampAngleInput');
  const gravitySlider = document.getElementById('gravitySlider');
  const gravityInput = document.getElementById('gravityInput');
  const verticalDropDisplay = document.getElementById('verticalDropDisplay');
  const gravityDisplay = document.getElementById('gravityDisplay');
  const participantsList = document.getElementById('participantsList');
  const resultsBody = document.getElementById('resultsBody');
  const addParticipantBtn = document.getElementById('addParticipantBtn');
  const raceCanvas = document.getElementById('raceCanvas');
  const racePlayBtn = document.getElementById('racePlayBtn');
  const racePauseBtn = document.getElementById('racePauseBtn');
  const raceResetBtn = document.getElementById('raceResetBtn');
  const raceTimeDisplay = document.getElementById('raceTimeDisplay');
  const raceLeaderDisplay = document.getElementById('raceLeaderDisplay');

  if (
    !rampLengthSlider ||
    !rampLengthInput ||
    !rampAngleSlider ||
    !rampAngleInput ||
    !gravitySlider ||
    !gravityInput ||
    !participantsList ||
    !resultsBody ||
    !raceCanvas
  ) {
    window.RollingRace = { activate() {} };
    return;
  }

  const raceCtx = raceCanvas.getContext('2d');

  const TYPE_DATA = {
    solidSphere: { label: 'Solid sphere', ratio: 2 / 5 },
    solidCylinder: { label: 'Solid cylinder', ratio: 1 / 2 },
    hollowCylinder: { label: 'Hollow cylinder (hoop)', ratio: 1 },
    hollowSphere: { label: 'Hollow sphere', ratio: 2 / 3 },
  };

  const COLOR_PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
  const MIN_PARTICIPANTS_FOR_RACE = 2;

  let participants = [];
  let idCounter = 1;
  let latestMetrics = [];
  let sortedMetrics = [];
  let raceMaxTime = 0;
  let racePixelRatio = window.devicePixelRatio || 1;
  let canvasCssWidth = 640;
  let canvasCssHeight = 360;

  const rampState = {
    length: Number(rampLengthInput.value) || 3,
    angle: Number(rampAngleInput.value) || 15,
    gravity: Number(gravityInput.value) || 9.81,
  };

  const raceAnimation = {
    isRunning: false,
    rafId: null,
    elapsed: 0,
    lastTimestamp: null,
  };

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  function createDefaultParticipant(overrides = {}) {
    const typeKeys = Object.keys(TYPE_DATA);
    const participant = {
      id: idCounter++,
      name: overrides.name ?? `Object ${idCounter - 1}`,
      type: overrides.type ?? typeKeys[participants.length % typeKeys.length],
      radius: overrides.radius ?? 0.12,
      mass: overrides.mass ?? 1.5,
    };
    participants.push(participant);
    return participant;
  }

  function syncRampInputs() {
    rampLengthSlider.value = String(rampState.length);
    rampLengthInput.value = String(rampState.length);
    rampAngleSlider.value = String(rampState.angle);
    rampAngleInput.value = String(rampState.angle);
    gravitySlider.value = String(rampState.gravity);
    gravityInput.value = String(rampState.gravity);
  }

  function updateRampDisplays() {
    const angleRad = (rampState.angle * Math.PI) / 180;
    const drop = rampState.length * Math.sin(angleRad);
    if (verticalDropDisplay) {
      verticalDropDisplay.textContent = `${drop.toFixed(2)} m`;
    }
    if (gravityDisplay) {
      gravityDisplay.textContent = `${rampState.gravity.toFixed(2)} m/s^2`;
    }
  }

  function resizeCanvas() {
    const container = raceCanvas.parentElement;
    if (!container) {
      return;
    }
    const availableWidth = container.clientWidth - 24;
    if (availableWidth <= 0) {
      return;
    }
    const width = Math.min(680, Math.max(300, availableWidth));
    const height = Math.max(240, Math.round(width * 0.55));
    canvasCssWidth = width;
    canvasCssHeight = height;
    raceCanvas.style.width = `${width}px`;
    raceCanvas.style.height = `${height}px`;
    racePixelRatio = window.devicePixelRatio || 1;
    raceCanvas.width = Math.round(width * racePixelRatio);
    raceCanvas.height = Math.round(height * racePixelRatio);
    raceCtx.setTransform(racePixelRatio, 0, 0, racePixelRatio, 0, 0);
    drawRaceScene(raceAnimation.elapsed);
  }

  function computeMetrics(participant) {
    const typeInfo = TYPE_DATA[participant.type];
    if (!typeInfo) {
      return null;
    }

    const angleRad = (rampState.angle * Math.PI) / 180;
    const sinTheta = Math.sin(angleRad);
    if (sinTheta <= 0) {
      return null;
    }

    const inertiaRatio = typeInfo.ratio;
    const acceleration = (rampState.gravity * sinTheta) / (1 + inertiaRatio);
    if (!Number.isFinite(acceleration) || acceleration <= 0) {
      return null;
    }

    const time = Math.sqrt((2 * rampState.length) / acceleration);
    const finalVelocity = acceleration * time;

    return {
      participant,
      acceleration,
      time,
      finalVelocity,
    };
  }

  function computeMomentOfInertia(participant) {
    const typeInfo = TYPE_DATA[participant.type];
    if (!typeInfo) {
      return null;
    }
    const inertia = typeInfo.ratio * participant.mass * participant.radius * participant.radius;
    if (!Number.isFinite(inertia)) {
      return null;
    }
    return inertia;
  }

  function renderParticipants() {
    participantsList.innerHTML = '';

    participants.forEach((participant) => {
      const row = document.createElement('div');
      row.className = 'participant-row';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = participant.name;
      nameInput.setAttribute('aria-label', 'Object name');
      nameInput.addEventListener('input', () => {
        participant.name = nameInput.value.trim() || `Object ${participant.id}`;
        updateResults();
      });
      row.appendChild(nameInput);

      const inertiaDisplay = document.createElement('span');
      inertiaDisplay.className = 'moment-of-inertia';
      inertiaDisplay.setAttribute('aria-live', 'polite');
      const updateInertiaDisplay = () => {
        const inertia = computeMomentOfInertia(participant);
        if (inertia === null) {
          inertiaDisplay.textContent = 'Moment of inertia: --';
          return;
        }
        inertiaDisplay.textContent = `Moment of inertia: ${inertia.toFixed(3)} kg*m^2`;
      };

      const typeSelect = document.createElement('select');
      Object.entries(TYPE_DATA).forEach(([value, info]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = info.label;
        if (value === participant.type) {
          option.selected = true;
        }
        typeSelect.appendChild(option);
      });
      typeSelect.addEventListener('change', () => {
        participant.type = typeSelect.value;
        updateResults();
        updateInertiaDisplay();
      });
      row.appendChild(typeSelect);

      const radiusContainer = document.createElement('div');
      radiusContainer.className = 'range-input';
      const radiusInput = document.createElement('input');
      radiusInput.type = 'range';
      radiusInput.min = '0.05';
      radiusInput.max = '0.16';
      radiusInput.step = '0.005';
      const radiusValue = document.createElement('span');
      radiusValue.className = 'range-value';
      const syncRadius = () => {
        radiusValue.textContent = `${participant.radius.toFixed(3)} m`;
      };
      const initializeRadius = () => {
        const clamped = clamp(participant.radius, Number(radiusInput.min), Number(radiusInput.max));
        participant.radius = Number(clamped.toFixed(3));
        radiusInput.value = String(participant.radius);
        syncRadius();
      };
      radiusInput.value = String(participant.radius);
      radiusInput.addEventListener('input', () => {
        const value = clamp(Number(radiusInput.value), Number(radiusInput.min), Number(radiusInput.max));
        participant.radius = Number(value.toFixed(3));
        radiusInput.value = String(participant.radius);
        syncRadius();
        updateResults();
        updateInertiaDisplay();
      });
      radiusContainer.appendChild(radiusInput);
      radiusContainer.appendChild(radiusValue);
      row.appendChild(radiusContainer);

      const massContainer = document.createElement('div');
      massContainer.className = 'range-input';
      const massInput = document.createElement('input');
      massInput.type = 'range';
      massInput.min = '0.1';
      massInput.max = '50';
      massInput.step = '0.1';
      const massValue = document.createElement('span');
      massValue.className = 'range-value';
      const syncMass = () => {
        massValue.textContent = `${participant.mass.toFixed(2)} kg`;
      };
      const initializeMass = () => {
        const clamped = clamp(participant.mass, Number(massInput.min), Number(massInput.max));
        participant.mass = Number(clamped.toFixed(3));
        massInput.value = String(participant.mass);
        syncMass();
      };
      massInput.value = String(participant.mass);
      massInput.addEventListener('input', () => {
        const value = clamp(Number(massInput.value), Number(massInput.min), Number(massInput.max));
        participant.mass = Number(value.toFixed(3));
        massInput.value = String(participant.mass);
        syncMass();
        updateResults();
        updateInertiaDisplay();
      });
      massContainer.appendChild(massInput);
      massContainer.appendChild(massValue);
      row.appendChild(massContainer);
      row.appendChild(inertiaDisplay);

      initializeRadius();
      initializeMass();
      updateInertiaDisplay();

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'secondary';
      removeBtn.textContent = 'Remove';
      removeBtn.setAttribute('aria-label', 'Remove object');
      removeBtn.disabled = participants.length <= 1;
      removeBtn.addEventListener('click', () => {
        if (participants.length <= 1) {
          return;
        }
        participants = participants.filter((item) => item.id !== participant.id);
        renderParticipants();
        updateResults();
      });
      row.appendChild(removeBtn);

      participantsList.appendChild(row);
    });
  }

  function updateResults(options = {}) {
    const { resetAnimation = true } = options;

    latestMetrics = participants
      .map((participant) => computeMetrics(participant))
      .filter(Boolean);

    sortedMetrics = latestMetrics.slice().sort((a, b) => a.time - b.time);
    raceMaxTime = sortedMetrics.reduce((max, entry) => Math.max(max, entry.time), 0);

    if (!latestMetrics.length) {
      resultsBody.innerHTML = '<tr><td colspan="5" class="empty">Add objects to compare race times.</td></tr>';
      if (resetAnimation) {
        resetRaceAnimation();
      } else {
        drawRaceScene(raceAnimation.elapsed);
        updateRaceStatus();
        updateControls();
      }
      return;
    }

    resultsBody.innerHTML = '';
    sortedMetrics.forEach((entry, index) => {
      const row = document.createElement('tr');
      if (index === 0) {
        row.classList.add('leader');
      }

      const cells = [
        (index + 1).toString(),
        entry.participant.name,
        entry.acceleration.toFixed(2),
        entry.time.toFixed(3),
        entry.finalVelocity.toFixed(2),
      ];

      cells.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });

      resultsBody.appendChild(row);
    });

    if (sortedMetrics.length < MIN_PARTICIPANTS_FOR_RACE) {
      const infoRow = document.createElement('tr');
      infoRow.innerHTML = '<td colspan="5" class="empty">Add another object to start a race.</td>';
      resultsBody.appendChild(infoRow);
    }

    if (resetAnimation) {
      stopRaceAnimation();
      raceAnimation.elapsed = 0;
    } else if (raceAnimation.elapsed > raceMaxTime) {
      raceAnimation.elapsed = raceMaxTime;
    }

    updateElapsedDisplay();
    drawRaceScene(raceAnimation.elapsed);
    updateRaceStatus();
    updateControls();
  }

  function updateControls() {
    const canRace = sortedMetrics.length >= MIN_PARTICIPANTS_FOR_RACE && raceMaxTime > 0;
    if (racePlayBtn) {
      racePlayBtn.disabled = !canRace || raceAnimation.isRunning;
    }
    if (racePauseBtn) {
      racePauseBtn.disabled = !raceAnimation.isRunning;
    }
    if (raceResetBtn) {
      raceResetBtn.disabled = !sortedMetrics.length && raceAnimation.elapsed === 0;
    }
  }

  function updateElapsedDisplay() {
    if (raceTimeDisplay) {
      raceTimeDisplay.textContent = `${raceAnimation.elapsed.toFixed(2)} s`;
    }
  }

  function fractionAlongRamp(metric, elapsedSeconds) {
    const distance = 0.5 * metric.acceleration * elapsedSeconds * elapsedSeconds;
    return Math.min(distance / rampState.length, 1);
  }

  function updateRaceStatus() {
    if (!raceLeaderDisplay) {
      return;
    }

    if (!latestMetrics.length) {
      raceLeaderDisplay.textContent = '--';
      return;
    }

    if (!raceAnimation.isRunning && raceAnimation.elapsed === 0) {
      raceLeaderDisplay.textContent = '--';
      return;
    }

    if (raceAnimation.elapsed >= raceMaxTime && sortedMetrics.length) {
      raceLeaderDisplay.textContent = `Winner: ${sortedMetrics[0].participant.name}`;
      return;
    }

    let leader = null;
    let maxFraction = -Infinity;
    latestMetrics.forEach((metric) => {
      const frac = fractionAlongRamp(metric, raceAnimation.elapsed);
      if (frac > maxFraction) {
        maxFraction = frac;
        leader = metric.participant;
      }
    });

    raceLeaderDisplay.textContent = leader ? leader.name : '--';
  }

  function drawRaceScene(elapsedSeconds = raceAnimation.elapsed) {
    const width = canvasCssWidth;
    const height = canvasCssHeight;
    raceCtx.clearRect(0, 0, width, height);

    raceCtx.fillStyle = '#f8fafc';
    raceCtx.fillRect(0, 0, width, height);

    const paddingX = 60;
    const paddingY = 40;
    const angleRad = (rampState.angle * Math.PI) / 180;
    const rampLengthPx = Math.max(220, Math.min(width - paddingX * 2, width - 140));
    const dx = rampLengthPx * Math.cos(angleRad);
    const dy = rampLengthPx * Math.sin(angleRad);
    const rampVectorLength = Math.hypot(dx, dy) || 1;
    const normalX = dy / rampVectorLength;
    const normalY = -dx / rampVectorLength;
    const startX = paddingX;
    const endX = startX + dx;

    if (!latestMetrics.length) {
      const placeholderY = height / 2;
      raceCtx.font = '14px "Segoe UI", Tahoma, sans-serif';
      raceCtx.fillText('Add objects to see the race animation.', startX, Math.max(40, placeholderY - 20));
      return;
    }

    const rampCount = latestMetrics.length;
    const availableHeight = Math.max(height - paddingY * 2 - dy, 0);
    const rowSpacing = rampCount > 1 ? availableHeight / (rampCount - 1) : 0;
    const topStartY = paddingY;
    const bottomFinishY = paddingY + availableHeight + dy;

    latestMetrics.forEach((metric, index) => {
      const participantIndex = participants.findIndex((item) => item.id === metric.participant.id);
      const color = COLOR_PALETTE[participantIndex % COLOR_PALETTE.length];
      const frac = fractionAlongRamp(metric, elapsedSeconds);
      const radiusPx = Math.max(12, Math.min(28, metric.participant.radius * 180));
      const startY = topStartY + rowSpacing * index;
      const endY = startY + dy;
      const contactX = startX + dx * frac;
      const contactY = startY + dy * frac;
      const drawX = contactX + normalX * radiusPx;
      const drawY = contactY + normalY * radiusPx;

      raceCtx.strokeStyle = '#cbd5f5';
      raceCtx.lineWidth = 4;
      raceCtx.beginPath();
      raceCtx.moveTo(startX, startY);
      raceCtx.lineTo(endX, endY);
      raceCtx.stroke();

      raceCtx.lineWidth = 2;
      raceCtx.strokeStyle = '#94a3b8';
      raceCtx.beginPath();
      raceCtx.moveTo(startX, startY);
      raceCtx.lineTo(startX, startY - 24);
      raceCtx.stroke();
      raceCtx.beginPath();
      raceCtx.moveTo(endX, endY);
      raceCtx.lineTo(endX, endY - 24);
      raceCtx.stroke();

      const isHoop = metric.participant.type === 'hollowCylinder';
      if (isHoop) {
        const ringWidth = Math.max(6, radiusPx * 0.35);
        const ringRadius = Math.max(radiusPx - ringWidth / 2, 4);

        raceCtx.lineWidth = ringWidth;
        raceCtx.strokeStyle = color;
        raceCtx.beginPath();
        raceCtx.arc(drawX, drawY, ringRadius, 0, Math.PI * 2);
        raceCtx.stroke();

        raceCtx.lineWidth = 1.5;
        raceCtx.strokeStyle = '#1f2937';
        raceCtx.beginPath();
        raceCtx.arc(drawX, drawY, ringRadius + ringWidth / 2, 0, Math.PI * 2);
        raceCtx.stroke();
      } else {
        raceCtx.beginPath();
        raceCtx.fillStyle = color;
        raceCtx.strokeStyle = '#1f2937';
        raceCtx.lineWidth = 1.5;
        raceCtx.arc(drawX, drawY, radiusPx, 0, Math.PI * 2);
        raceCtx.fill();
        raceCtx.stroke();
      }

      const traveledDistance = rampState.length * frac;
      const radiusMeters = Math.max(metric.participant.radius, 0.01);
      const rotationAngle = (traveledDistance / radiusMeters) % (Math.PI * 2);
      const dotAngle = rotationAngle - Math.PI / 2;
      const dotDistance = radiusPx * 0.65;
      const dotRadius = Math.max(3, radiusPx * 0.18);
      const dotX = drawX + Math.cos(dotAngle) * dotDistance;
      const dotY = drawY + Math.sin(dotAngle) * dotDistance;

      raceCtx.beginPath();
      raceCtx.fillStyle = '#f8fafc';
      raceCtx.strokeStyle = '#1f2937';
      raceCtx.lineWidth = 1;
      raceCtx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      raceCtx.fill();
      raceCtx.stroke();

      raceCtx.fillStyle = '#1f2937';
      raceCtx.font = '12px "Segoe UI", Tahoma, sans-serif';
      raceCtx.fillText(metric.participant.name, drawX + radiusPx + 8, drawY + 4);
    });

    raceCtx.fillStyle = '#475569';
    raceCtx.font = '12px "Segoe UI", Tahoma, sans-serif';
    raceCtx.fillText('Start', startX - 30, topStartY - 28);
    raceCtx.fillText('Finish', endX - 32, bottomFinishY - 28);
  }

  function stopRaceAnimation() {
    if (raceAnimation.rafId !== null) {
      cancelAnimationFrame(raceAnimation.rafId);
      raceAnimation.rafId = null;
    }
    raceAnimation.isRunning = false;
    raceAnimation.lastTimestamp = null;
    updateControls();
  }

  function resetRaceAnimation() {
    stopRaceAnimation();
    raceAnimation.elapsed = 0;
    updateElapsedDisplay();
    updateRaceStatus();
    drawRaceScene(0);
  }

  function stepAnimation(timestamp) {
    if (!raceAnimation.isRunning) {
      return;
    }

    if (raceAnimation.lastTimestamp === null) {
      raceAnimation.lastTimestamp = timestamp;
    }

    const delta = (timestamp - raceAnimation.lastTimestamp) / 1000;
    raceAnimation.lastTimestamp = timestamp;
    raceAnimation.elapsed = Math.min(raceAnimation.elapsed + delta, raceMaxTime);

    drawRaceScene(raceAnimation.elapsed);
    updateElapsedDisplay();
    updateRaceStatus();

    if (raceAnimation.elapsed >= raceMaxTime) {
      stopRaceAnimation();
      updateRaceStatus();
    } else {
      raceAnimation.rafId = requestAnimationFrame(stepAnimation);
    }
  }

  function startRaceAnimation() {
    const canRace = sortedMetrics.length >= MIN_PARTICIPANTS_FOR_RACE && raceMaxTime > 0;
    if (!canRace || raceAnimation.isRunning) {
      return;
    }

    raceAnimation.elapsed = 0;
    raceAnimation.lastTimestamp = null;
    raceAnimation.isRunning = true;
    raceLeaderDisplay.textContent = '--';
    raceAnimation.rafId = requestAnimationFrame(stepAnimation);
    updateControls();
  }

  function pauseRaceAnimation() {
    if (!raceAnimation.isRunning) {
      return;
    }
    stopRaceAnimation();
    updateRaceStatus();
  }

  function handleRampChange() {
    rampState.length = clamp(Number(rampLengthInput.value), 1, 10);
    rampState.angle = clamp(Number(rampAngleInput.value), 5, 60);
    rampState.gravity = clamp(Number(gravityInput.value), 1, 25);
    syncRampInputs();
    updateRampDisplays();
    updateResults();
  }

  function initListeners() {
    rampLengthSlider.addEventListener('input', () => {
      rampState.length = Number(rampLengthSlider.value);
      rampLengthInput.value = rampLengthSlider.value;
      updateRampDisplays();
      updateResults();
    });
    rampLengthInput.addEventListener('input', handleRampChange);

    rampAngleSlider.addEventListener('input', () => {
      rampState.angle = Number(rampAngleSlider.value);
      rampAngleInput.value = rampAngleSlider.value;
      updateRampDisplays();
      updateResults();
    });
    rampAngleInput.addEventListener('input', handleRampChange);

    gravitySlider.addEventListener('input', () => {
      rampState.gravity = Number(gravitySlider.value);
      gravityInput.value = gravitySlider.value;
      updateRampDisplays();
      updateResults();
    });
    gravityInput.addEventListener('input', handleRampChange);

    addParticipantBtn.addEventListener('click', () => {
      createDefaultParticipant();
      renderParticipants();
      updateResults();
    });

    racePlayBtn.addEventListener('click', startRaceAnimation);
    racePauseBtn.addEventListener('click', pauseRaceAnimation);
    raceResetBtn.addEventListener('click', resetRaceAnimation);
    window.addEventListener('resize', resizeCanvas);
  }

  function initialize() {
    createDefaultParticipant({ name: 'Solid sphere', type: 'solidSphere', radius: 0.12, mass: 1.5 });
    createDefaultParticipant({ name: 'Hollow cylinder', type: 'hollowCylinder', radius: 0.12, mass: 1.5 });
    syncRampInputs();
    updateRampDisplays();
    renderParticipants();
    updateResults({ resetAnimation: true });
    updateElapsedDisplay();
    updateRaceStatus();
    resizeCanvas();
  }

  initListeners();
  initialize();

  window.RollingRace = {
    activate() {
      updateRampDisplays();
      updateResults({ resetAnimation: false });
      resizeCanvas();
      updateElapsedDisplay();
      updateRaceStatus();
      updateControls();
    },
  };
})();
