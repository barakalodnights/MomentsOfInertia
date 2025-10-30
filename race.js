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

const TYPE_DATA = {
  solidSphere: {
    label: 'Solid sphere',
    ratio: 2 / 5,
  },
  solidCylinder: {
    label: 'Solid cylinder',
    ratio: 1 / 2,
  },
  hollowCylinder: {
    label: 'Hollow cylinder (hoop)',
    ratio: 1,
  },
};

let participants = [];
let idCounter = 1;

const rampState = {
  length: Number(rampLengthInput?.value) || 3,
  angle: Number(rampAngleInput?.value) || 15,
  gravity: Number(gravityInput?.value) || 9.81,
};

function createDefaultParticipant(overrides = {}) {
  const participant = {
    id: idCounter++,
    name: overrides.name || `Object ${idCounter - 1}`,
    type: overrides.type || 'solidSphere',
    radius: overrides.radius ?? 0.12,
    mass: overrides.mass ?? 1.5,
  };
  participants.push(participant);
  return participant;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function syncRampInputs() {
  rampLengthSlider.value = rampState.length;
  rampLengthInput.value = rampState.length;
  rampAngleSlider.value = rampState.angle;
  rampAngleInput.value = rampState.angle;
  gravitySlider.value = rampState.gravity;
  gravityInput.value = rampState.gravity;
}

function updateRampDisplays() {
  const angleRad = (rampState.angle * Math.PI) / 180;
  const drop = rampState.length * Math.sin(angleRad);
  verticalDropDisplay.textContent = `${drop.toFixed(2)} m`;
  gravityDisplay.textContent = `${rampState.gravity.toFixed(2)} m/s²`;
}

function handleRampChange() {
  rampState.length = clamp(Number(rampLengthInput.value), 1, 10);
  rampState.angle = clamp(Number(rampAngleInput.value), 1, 60);
  rampState.gravity = clamp(Number(gravityInput.value), 1, 25);
  syncRampInputs();
  updateRampDisplays();
  updateResults();
}

function renderParticipants() {
  if (!participantsList) {
    return;
  }
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

    const typeSelect = document.createElement('select');
    Object.entries(TYPE_DATA).forEach(([value, info]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = info.label;
      if (participant.type === value) {
        option.selected = true;
      }
      typeSelect.appendChild(option);
    });
    typeSelect.addEventListener('change', () => {
      participant.type = typeSelect.value;
      updateResults();
    });
    row.appendChild(typeSelect);

    const radiusInput = document.createElement('input');
    radiusInput.type = 'number';
    radiusInput.min = '0.01';
    radiusInput.max = '1.0';
    radiusInput.step = '0.01';
    radiusInput.value = participant.radius;
    radiusInput.addEventListener('input', () => {
      const value = clamp(Number(radiusInput.value), 0.01, 1);
      participant.radius = value;
      radiusInput.value = value;
      updateResults();
    });
    row.appendChild(radiusInput);

    const massInput = document.createElement('input');
    massInput.type = 'number';
    massInput.min = '0.1';
    massInput.max = '50';
    massInput.step = '0.1';
    massInput.value = participant.mass;
    massInput.addEventListener('input', () => {
      const value = clamp(Number(massInput.value), 0.1, 50);
      participant.mass = value;
      massInput.value = value;
      updateResults();
    });
    row.appendChild(massInput);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'secondary';
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('aria-label', `Remove ${participant.name}`);
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

function computeRaceMetrics(participant) {
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
  const acceleration =
    rampState.gravity * sinTheta / (1 + inertiaRatio);
  const time = Math.sqrt((2 * rampState.length) / acceleration);
  const finalVelocity = acceleration * time;

  return {
    name: participant.name,
    type: typeInfo.label,
    acceleration,
    time,
    finalVelocity,
  };
}

function updateResults() {
  if (!resultsBody) {
    return;
  }
  const metrics = participants
    .map((participant) => ({
      participant,
      metrics: computeRaceMetrics(participant),
    }))
    .filter((entry) => entry.metrics);

  if (metrics.length === 0) {
    resultsBody.innerHTML = `<tr><td colspan="5" class="empty">Add objects to compare predicted race times.</td></tr>`;
    return;
  }

  metrics.sort((a, b) => a.metrics.time - b.metrics.time);

  resultsBody.innerHTML = '';
  metrics.forEach((entry, index) => {
    const tr = document.createElement('tr');
    if (index === 0 && metrics.length > 1) {
      tr.classList.add('leader');
    }
    const { name, acceleration, time, finalVelocity } = entry.metrics;

    const cells = [
      index + 1,
      name,
      `${acceleration.toFixed(2)}`,
      `${time.toFixed(3)}`,
      `${finalVelocity.toFixed(2)}`,
    ];
    cells.forEach((text) => {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    });
    resultsBody.appendChild(tr);
  });
}

function initListeners() {
  if (!rampLengthSlider) {
    return;
  }
  rampLengthSlider.addEventListener('input', () => {
    rampState.length = Number(rampLengthSlider.value);
    rampLengthInput.value = rampState.length;
    updateRampDisplays();
    updateResults();
  });
  rampLengthInput.addEventListener('input', handleRampChange);

  rampAngleSlider.addEventListener('input', () => {
    rampState.angle = Number(rampAngleSlider.value);
    rampAngleInput.value = rampState.angle;
    updateRampDisplays();
    updateResults();
  });
  rampAngleInput.addEventListener('input', handleRampChange);

  gravitySlider.addEventListener('input', () => {
    rampState.gravity = Number(gravitySlider.value);
    gravityInput.value = rampState.gravity;
    updateRampDisplays();
    updateResults();
  });
  gravityInput.addEventListener('input', handleRampChange);

  addParticipantBtn?.addEventListener('click', () => {
    createDefaultParticipant();
    renderParticipants();
    updateResults();
  });
}

function initializeRace() {
  if (!participants.length) {
    createDefaultParticipant({ name: 'Solid Sphere', type: 'solidSphere', radius: 0.12, mass: 1.5 });
    createDefaultParticipant({ name: 'Hollow Cylinder', type: 'hollowCylinder', radius: 0.12, mass: 1.5 });
  }
  syncRampInputs();
  updateRampDisplays();
  renderParticipants();
  updateResults();
}

initListeners();
initializeRace();

window.RollingRace = {
  activate() {
    renderParticipants();
    updateRampDisplays();
    updateResults();
  },
};

})();
