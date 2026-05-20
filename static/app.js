const SPEEDS = [
  { label: "Real", value: 1 / 3600 },
  { label: "0.5x", value: 0.5 / 60 },
  { label: "1x", value: 1 / 60 },
  { label: "2x", value: 2 / 60 },
  { label: "4x", value: 4 / 60 },
  { label: "6x", value: 6 / 60 },
  { label: "8x", value: 8 / 60 },
  { label: "10x", value: 10 / 60 },
  { label: "15x", value: 15 / 60 },
  { label: "20x", value: 20 / 60 }
];

let speed = 1 / 60;
let paused = false;
let result = null;
let simTime = 0;
let lastFrame = performance.now();
let events = [];
let eventIndex = 0;
let capacity = 250;
let visibleLimit = 90;
let renderer, scene, camera, motorcycleGroup, staticGroup;
let occupancyChart;
const bikes = new Map();

let realAcceptedCount = 0;
//let realRejectedCount = 0;

let isDragging = false;
let previousPointerPosition = { x: 0, y: 0 };
const dragSensitivity = 0.05;

const SOUTH_Z = -34;
const ENTRY_Z = -24;
const EAST_X = 16;
const SPINE_X = -8;
const TOP_Z = 22;
const AISLE_Z = [-14, -8, -2, 4, 10, 16];
const BIKE_COLORS = ["#16d17a", "#2f80ed", "#f2c94c", "#eb5757", "#bb6bd9", "#f2994a", "#56ccf2", "#27ae60"];
const SLOTS_PER_AISLE = 40;

initThree();
initUi();
runSimulation();
requestAnimationFrame(tick);

function initUi() {
  const speedBox = document.getElementById("speedButtons");
  SPEEDS.forEach((item) => {
    const btn = document.createElement("button");
    btn.textContent = item.label;
    btn.title = `Velocidad ${item.label}`;
    btn.className = item.label === "1x" ? "active" : "";
    btn.onclick = () => {
      speed = item.value;
      [...speedBox.children].forEach((child) => child.classList.remove("active"));
      btn.classList.add("active");
    };
    speedBox.appendChild(btn);
  });
  document.getElementById("runBtn").onclick = runSimulation;
  document.getElementById("pauseBtn").onclick = () => {
    paused = !paused;
    document.getElementById("pauseBtn").textContent = paused ? "Continuar" : "Pausar";
  };
  document.getElementById("reportBtn").onclick = generateReport;
  document.getElementById("randomSeedBtn").onclick = () => {
    const randomSeed = Math.floor(1000000000 + Math.random() * 9000000000);
    document.getElementById("seedInput").value = randomSeed;
  };
  const unlimitedCheck = document.getElementById("unlimitedBikesCheck");
  const visibleLimitInput = document.getElementById("visibleLimitInput");

  if (unlimitedCheck && visibleLimitInput) {
    unlimitedCheck.addEventListener("change", () => {
      if (unlimitedCheck.checked) {
        visibleLimitInput.disabled = true;
        visibleLimitInput.style.opacity = "0.5";
      } else {
        visibleLimitInput.disabled = false;
        visibleLimitInput.style.opacity = "1";
      }
    });
  }
  // Estados de modo: true = Tasa (motos/hora), false = Tiempo promedio (horas/moto)
  let modeArrivalRate = true;
  let modeServiceRate = true;

  const btnArrival = document.getElementById("switchArrivalBtn");
  const inputArrival = document.getElementById("arrivalInput");
  const labelArrival = document.getElementById("labelArrival");

  btnArrival.onclick = () => {
    let val = parseFloat(inputArrival.value);
    if (!isNaN(val) && val > 0) {
      inputArrival.value = (1 / val).toFixed(4); // Invertir el valor numérico
    }else {
      inputArrival.value = "0"; // Si era 0, se queda en 0
    }
    modeArrivalRate = !modeArrivalRate;
    if (modeArrivalRate) {
      labelArrival.textContent = "λ motos/hora";
      inputArrival.setAttribute("step", "0.1");
      btnArrival.title = "Cambiar a Tiempo Promedio";
    } else {
      labelArrival.textContent = "1/λ horas/moto";
      inputArrival.setAttribute("step", "0.0001");
      btnArrival.title = "Cambiar a Tasa de Entrada";
    }
  };

  const btnService = document.getElementById("switchServiceBtn");
  const inputService = document.getElementById("serviceInput");
  const labelService = document.getElementById("labelService");

  btnService.onclick = () => {
    let val = parseFloat(inputService.value);
    if (!isNaN(val) && val > 0) {
      inputService.value = (1 / val).toFixed(4); // Invertir el valor numérico
    }else {
      inputService.value = "0"; // Si era 0, se queda en 0
    }
    modeServiceRate = !modeServiceRate;
    if (modeServiceRate) {
      labelService.textContent = "μ salidas/hora";
      inputService.setAttribute("step", "0.0001");
      btnService.title = "Cambiar a Tiempo Promedio";
    } else {
      labelService.textContent = "1/μ horas/moto";
      inputService.setAttribute("step", "0.1");
      btnService.title = "Cambiar a Tasa de Atención";
    }
  };

  // Guardar los estados en el dataset del formulario para usarlos en runSimulation
  const form = document.getElementById("configForm");
  form.dataset.arrivalMode = "rate";
  form.dataset.serviceMode = "rate";

  btnArrival.addEventListener("click", () => {
    form.dataset.arrivalMode = modeArrivalRate ? "rate" : "time";
  });
  btnService.addEventListener("click", () => {
    form.dataset.serviceMode = modeServiceRate ? "rate" : "time";
  });
  setupInputSanitization();
}

function setupInputSanitization() {
  const inputs = document.querySelectorAll('#configForm input[type="number"]');
  inputs.forEach(input => {
    // 1. Bloquear pulsaciones de teclas dañinas de forma directa
    input.addEventListener('keydown', (e) => {
      const step = input.getAttribute('step');
      const isInt = !step || step === '1';
      const minVal = parseFloat(input.getAttribute('min') || '0');
      
      let bannedKeys = ['e', 'E', '+'];
      if (isInt) bannedKeys.push('.', ','); // Enteros no admiten separadores decimales
      if (minVal >= 0) bannedKeys.push('-'); // No permitir negativos si el mínimo es >= 0

      if (bannedKeys.includes(e.key)) {
        e.preventDefault();
      }
    });

    // 2. Limpieza en tiempo real (por si copian y pegan texto sucio)
    input.addEventListener('input', () => {
      let val = input.value;
      val = val.replace(/,/g, '.'); // Convertir comas en puntos automáticamente
      
      const step = input.getAttribute('step');
      if (!step || step === '1') {
        val = val.replace(/[^0-9]/g, ''); // Forzar solo dígitos si es entero
      }
      if (input.value !== val) {
        input.value = val;
      }
    });

    // 3. Sistema de recuperación en pérdida de foco (Blur)
    input.addEventListener('blur', () => {
      let val = parseFloat(input.value);
      const min = parseFloat(input.getAttribute('min'));
      const max = parseFloat(input.getAttribute('max'));
      const defaultVal = input.getAttribute('value');

      // Si se dejó en blanco, restaurar el valor por defecto de fábrica
      if (isNaN(val)) {
        input.value = defaultVal;
        return;
      }

      // Ajustar automáticamente si intentan burlar los bordes
      if (!isNaN(min) && val < min) val = min;
      if (!isNaN(max) && val > max) val = max;
      
      input.value = val;
    });
  });
}

function initThree() {
  const viewport = document.getElementById("viewport");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101216);
  camera = new THREE.PerspectiveCamera(36, viewport.clientWidth / viewport.clientHeight, 0.1, 1000);
  //camera.position.set(2, 34, -46);
  camera.position.set(2, 34, -50);
  //camera.lookAt(2, 0, -8);
  camera.lookAt(2, -4, -8);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  viewport.appendChild(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.74));
  const sun = new THREE.DirectionalLight(0xffffff, 0.92);
  sun.position.set(18, 42, 20);
  scene.add(sun);
  staticGroup = new THREE.Group();
  motorcycleGroup = new THREE.Group();
  scene.add(staticGroup, motorcycleGroup);
  buildParking();
  window.addEventListener("resize", resize);

  viewport.style.cursor = "grab"; // Cambia el cursor para indicar que es interactivo

  viewport.addEventListener("pointerdown", (e) => {
    isDragging = true;
    viewport.style.cursor = "grabbing";
    previousPointerPosition = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener("pointermove", (e) => {
    if (!isDragging) return;

    // Calculamos el diferencial de movimiento del mouse
    const deltaX = e.clientX - previousPointerPosition.x;
    const deltaY = e.clientY - previousPointerPosition.y;

    // Movemos tanto la posición de la cámara como el punto a donde mira
    // Como la cámara está inclinada mirando hacia abajo:
    // Mover el mouse a la izquierda/derecha altera el eje X.
    // Mover el mouse hacia arriba/abajo altera el eje Z en el mundo 3D.
    camera.position.x += deltaX * dragSensitivity;
    camera.position.z += deltaY * dragSensitivity;

    // Guardamos la posición actual para el siguiente frame
    previousPointerPosition = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener("pointerup", () => {
    isDragging = false;
    viewport.style.cursor = "grab";
  });
}

function buildParking() {
  staticGroup.clear();
  const layout = parkingLayout();
  const ground = box(layout.width, 0.18, layout.depth, 0x202927);
  ground.position.set(layout.centerX, -0.12, layout.centerZ);
  staticGroup.add(ground);

  const street = box(layout.width - 8, 0.08, 4.8, 0x303636);
  street.position.set(layout.centerX, 0.01, SOUTH_Z - 2);
  staticGroup.add(street);
  addLine([[layout.minX + 4, 0.09, SOUTH_Z - 2], [layout.maxX - 4, 0.09, SOUTH_Z - 2]], 0xd9dedc, 2);

  const route = [[layout.entryX, 0.12, SOUTH_Z], [layout.entryX, 0.12, ENTRY_Z], [SPINE_X, 0.12, ENTRY_Z], [SPINE_X, 0.12, layout.maxAisleZ + 5]];
  addTube(route, 0xffffff, 0.08);
  layout.aisles.forEach((z) => addTube([[SPINE_X, 0.12, z], [layout.maxSlotX - 0.7, 0.12, z]], 0xbfc7c9, 0.045));

  const border = [
    [layout.minX + 5, 0.18, -20], [layout.maxX - 5, 0.18, -20], [layout.maxX - 5, 0.18, layout.maxAisleZ + 7],
    [layout.minX + 5, 0.18, layout.maxAisleZ + 7], [layout.minX + 5, 0.18, -20]
  ];
  addLine(border, 0x050505, 4);

  drawSlots(capacity);
}

function drawSlots(count) {
  const slotMat = new THREE.LineBasicMaterial({ color: 0x6d7778 });
  for (let i = 0; i < count; i++) {
    const slot = slotPosition(i);
    const w = 0.9;
    const h = 1.55;
    const points = [
      new THREE.Vector3(slot.x - w / 2, 0.13, slot.z - h / 2),
      new THREE.Vector3(slot.x + w / 2, 0.13, slot.z - h / 2),
      new THREE.Vector3(slot.x + w / 2, 0.13, slot.z + h / 2),
      new THREE.Vector3(slot.x - w / 2, 0.13, slot.z + h / 2),
      new THREE.Vector3(slot.x - w / 2, 0.13, slot.z - h / 2)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    staticGroup.add(new THREE.Line(geometry, slotMat));
  }
}

function parkingLayout() {
  const aisleCount = Math.max(1, Math.ceil(capacity / SLOTS_PER_AISLE));
  const aisles = Array.from({ length: aisleCount }, (_, i) => -14 + i * 4.2);
  const maxAisleZ = aisles[aisles.length - 1];
  const maxSlotX = SPINE_X + 3.8 + Math.ceil(SLOTS_PER_AISLE / 2) * 1.18;
  const minX = SPINE_X - 14;
  const maxX = maxSlotX + 8;
  const minZ = SOUTH_Z - 7;
  const maxZ = maxAisleZ + 12;
  return {
    aisles,
    maxAisleZ,
    maxSlotX,
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    entryX: SPINE_X + 18,
  };
}

function slotPosition(slot) {
  const layout = parkingLayout();
  const aisle = Math.min(Math.floor(slot / SLOTS_PER_AISLE), layout.aisles.length - 1);
  const index = slot - aisle * SLOTS_PER_AISLE;
  const side = index % 2;
  const offset = Math.floor(index / 2);
  return {
    x: SPINE_X + 3.8 + offset * 1.18,
    z: layout.aisles[aisle] + (side === 0 ? -1.05 : 1.05),
    aisleZ: layout.aisles[aisle],
    rotation: side === 0 ? Math.PI : 0
  };
}

function routeToSlot(slotIndex) {
  const layout = parkingLayout();
  const slot = slotPosition(slotIndex);
  const approachX = Math.max(slot.x, SPINE_X + 1.5);
  return [
    [layout.entryX, 0.2, SOUTH_Z],
    [layout.entryX, 0.2, ENTRY_Z],
    [SPINE_X, 0.2, ENTRY_Z],
    [SPINE_X, 0.2, slot.aisleZ],
    [approachX, 0.2, slot.aisleZ],
    [slot.x, 0.2, slot.z]
  ];
}

function routeFromSlot(slotIndex, pos) {
  const layout = parkingLayout();
  const slot = slotPosition(slotIndex);
  const approachX = Math.max(slot.x, SPINE_X + 1.5);
  return [
    [pos.x, pos.y, pos.z],
    [approachX, 0.2, slot.aisleZ],
    [SPINE_X, 0.2, slot.aisleZ],
    [SPINE_X, 0.2, ENTRY_Z],
    [layout.entryX, 0.2, ENTRY_Z],
    [layout.entryX, 0.2, SOUTH_Z - 6]
  ];
}

function addTube(points, color, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.02);
  const geometry = new THREE.TubeGeometry(curve, Math.max(points.length * 8, 24), radius, 8, false);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  staticGroup.add(new THREE.Mesh(geometry, material));
}

function addLine(points, color, width = 2) {
  const material = new THREE.LineBasicMaterial({ color, linewidth: width });
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  staticGroup.add(new THREE.Line(geometry, material));
}

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
}

function makeBike(color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x09090a });
  const metal = new THREE.MeshLambertMaterial({ color: 0x4b5563 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.45, 1.12), bodyMat);
  body.position.y = 0.48;
  group.add(body);

  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.52), metal);
  motor.position.set(0, 0.28, 0.02);
  group.add(motor);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.58), dark);
  seat.position.set(0, 0.74, -0.08);
  group.add(seat);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8), metal);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, 0.86, 0.42);
  group.add(handle);

  const headlight = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12), new THREE.MeshLambertMaterial({ color: 0xfef08a }));
  headlight.rotation.x = Math.PI / 2;
  headlight.position.set(0, 0.67, 0.62);
  group.add(headlight);

  [-0.52, 0.52].forEach((z) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 16), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.22, z);
    group.add(wheel);
  });

  group.scale.setScalar(1.12);
  return group;
}

async function runSimulation() {
  const form = document.getElementById("configForm");
  const formData = new FormData(form);
  const payload = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, Number(v)]));
  
  // CONVERSIÓN CRÍTICA: Si están en modo tiempo (1/λ o 1/μ), enviarle al backend su equivalente en tasa
  if (form.dataset.arrivalMode === "time" && payload.arrival_rate > 0) {
    payload.arrival_rate = 1 / payload.arrival_rate;
  }
  if (form.dataset.serviceMode === "time" && payload.service_rate > 0) {
    payload.service_rate = 1 / payload.service_rate;
  }

  const unlimitedCheck = document.getElementById("unlimitedBikesCheck");
  if (unlimitedCheck && unlimitedCheck.checked) {
    payload.visible_limit = Math.max(20, payload.capacity); 
  }

  try {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      // Si el backend estructuró los mensajes traducidos, muéstralos en bloque
      if (errorData.errors && Array.isArray(errorData.errors)) {
        alert(`❌ PARÁMETROS RECHAZADOS POR EL SISTEMA:\n\n${errorData.errors.join("\n")}`);
      } else {
        alert(`❌ ERROR: ${errorData.detail || "Error interno en los parámetros."}`);
      }
      return;
    }
    
    result = await res.json();
    capacity = result.config.capacity;
    visibleLimit = result.config.visible_limit;
    events = result.events;
    buildParking();
    resetAnimation();
    renderMetrics();
    renderChart();
    renderLog();
  } catch (err) {
    console.error(err);
    alert("❌ Error crítico de red o el servidor está caído.");
  }
}

function resetAnimation() {
  simTime = 0;
  eventIndex = 0;
  bikes.forEach((bike) => motorcycleGroup.remove(bike.mesh));
  bikes.clear();
  realAcceptedCount = 0;
  //realRejectedCount = 0;
  updateHud();
}

function tick(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.08);
  lastFrame = now;
  if (!paused && result) {
    simTime = Math.min(simTime + delta * speed, result.config.duration_hours);
    processEvents();
    
    // Mantenemos el delta real aquí para que a 1x no vaya lento
    animateBikes(delta); 
    
    updateHud();
  }
  camera.lookAt(camera.position.x, camera.position.y - 38, camera.position.z + 42);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function processEvents() {
  while (eventIndex < events.length && events[eventIndex].t <= simTime) {
    const event = events[eventIndex++];
    if (event.type === "arrival") realAcceptedCount++, spawnBike(event);
    if (event.type === "departure") exitBike(event);
  }
}

function spawnBike(event) {
  if (bikes.size >= visibleLimit) return;
  const bike = makeBike(event.color || BIKE_COLORS[event.id % BIKE_COLORS.length]);
  motorcycleGroup.add(bike);
  const path = routeToSlot(event.slot);
  bike.position.set(...path[0]);
  bikes.set(event.id, {
    mesh: bike,
    path,
    progress: 0,
    state: "entering",
    slot: event.slot,
    exitPending: false 
  });
}

function exitBike(event) {
  const bike = bikes.get(event.id);
  if (!bike) return;

  if (bike.state === "entering") {
    bike.exitPending = true;
  } else if (bike.state === "parked") {
    bike.path = routeFromSlot(event.slot, bike.mesh.position);
    bike.progress = 0;
    bike.state = "leaving";
  }
}

function animateBikes(delta) {
  // Descubrimos el multiplicador de velocidad actual (ej: en 1x es 1, en 20x es 20)
  const timeMultiplier = speed / (1 / 60);
  
  // Escalamos la velocidad base (4.8) por el multiplicador. 
  // A 1x la velocidad es 4.8. A 20x la velocidad física sube automáticamente a 96.
  const motion = 15.0 * timeMultiplier; 

  bikes.forEach((bike, id) => {
    if (bike.state === "parked") return;
    
    bike.progress += delta * motion;
    followPath(bike);
    
    if (bike.progress >= pathLength(bike.path)) {
      if (bike.state === "leaving") {
        motorcycleGroup.remove(bike.mesh);
        bikes.delete(id);
      } else if (bike.state === "entering") {
        if (bike.exitPending) {
          bike.state = "leaving";
          bike.path = routeFromSlot(bike.slot, bike.mesh.position);
          bike.progress = 0;
        } else {
          bike.state = "parked";
          const slot = slotPosition(bike.slot);
          bike.mesh.position.set(slot.x, 0.2, slot.z);
          bike.mesh.rotation.y = slot.rotation;
        }
      }
    }
  });
}

function followPath(bike) {
  let remaining = bike.progress;
  for (let i = 1; i < bike.path.length; i++) {
    const a = new THREE.Vector3(...bike.path[i - 1]);
    const b = new THREE.Vector3(...bike.path[i]);
    const segment = a.distanceTo(b);
    if (remaining <= segment) {
      const t = segment === 0 ? 1 : remaining / segment;
      bike.mesh.position.lerpVectors(a, b, t);
      bike.mesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      return;
    }
    remaining -= segment;
  }
}

function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += new THREE.Vector3(...path[i - 1]).distanceTo(new THREE.Vector3(...path[i]));
  }
  return total;
}

function updateHud() {
  if (!result) return;
  const current = result.timeline.reduce((prev, p) => p.t <= simTime ? p : prev, result.timeline[0]);
  document.getElementById("clock").textContent = formatClock(result.config.start_hour, simTime);
  document.getElementById("occupancy").textContent = `${current.occupancy} / ${capacity}`;
  document.getElementById("accepted").textContent = String(realAcceptedCount);
  //document.getElementById("accepted").textContent = String(current.accepted || 0);
  document.getElementById("rejected").textContent = String(current.rejected || 0);

  if (occupancyChart && result._allLabels && result._allData) {
    // Contamos cuántos puntos de la línea de tiempo ya deberían ser visibles
    const visiblePointsCount = result.timeline.filter(p => p.t <= simTime).length;

    // Cortamos los arreglos para mostrar únicamente los datos que ya ocurrieron
    occupancyChart.data.labels = result._allLabels.slice(0, visiblePointsCount);
    occupancyChart.data.datasets[0].data = result._allData.slice(0, visiblePointsCount);

    // Refrescamos la gráfica de forma inmediata y ultra-ligera
    occupancyChart.update('none');
  }
}

function formatClock(startHour, hours) {
  const minutes = Math.floor((startHour + hours) * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function renderMetrics() {
  const m = result.theoretical;
  const s = result.simulated;
  const items = [
    ["Tráfico ofrecido (A)", m.offered_traffic.toFixed(2)],
    ["Probabilidad de rechazo (Pk)", pct(m.pk)],
    ["Factor de utilización (ρ)", pct(m.rho)],
    ["Tasa efectiva de llegada (λe)", `${m.lambda_effective.toFixed(2)}/h`],
    ["Ocupación promedio (L)", s.average_occupancy.toFixed(2)],
    ["Probabilidad de rechazo sim. (PkSim)", pct(s.rejection_probability)],
    ["Tiempo de saturación sim. (TSim)", pct(s.full_time_ratio)]
  ];
  document.getElementById("metrics").innerHTML = items.map(([k, v]) => `<article><span>${k}</span><strong>${v}</strong></article>`).join("");
  document.getElementById("analysisSummary").textContent = result.analysis.summary;
  document.getElementById("analysisList").innerHTML = result.analysis.findings.concat(result.analysis.recommendations).map((x) => `<li>${x}</li>`).join("");
}

function renderChart() {
  const ctx = document.getElementById("occupancyChart");
  if (occupancyChart) occupancyChart.destroy();

  const demandData = result.timeline.map((p) => p.occupancy + (p.rejected || 0));
  const maxPeak = Math.max(...demandData, capacity); 
  const yMaxAxis = Math.ceil((maxPeak + 1) / 100) * 100;

  const capacityLinePlugin = {
    id: 'capacityLine',
    afterDraw(chart) {
      const { ctx, chartArea: { left, right }, scales: { y } } = chart;
      const yPos = y.getPixelForValue(capacity);
      if (yPos >= chart.chartArea.top && yPos <= chart.chartArea.bottom) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)'; 
        ctx.lineWidth = 3;                           
        ctx.setLineDash([15, 10]);                    
        ctx.moveTo(left, yPos);
        ctx.lineTo(right, yPos);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // Guardamos TODAS las etiquetas y datos completos en el objeto del resultado para usarlos de referencia
  result._allLabels = result.timeline.map((p) => formatClock(result.config.start_hour, p.t));
  result._allData = demandData;

  occupancyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [], // Se llenará dinámicamente en updateHud
      datasets: [{
        label: "Demanda Total (Ocupación + Rechazos)",
        data: [], // Se llenará dinámicamente en updateHud
        borderColor: "#9fd7e5",
        backgroundColor: "rgba(159, 215, 229, 0.18)",
        fill: true,
        pointRadius: 0,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      animation: false, // Evita parpadeos y consumo innecesario de memoria
      scales: {
        x: { 
          ticks: { color: "#9fb0c2", maxTicksLimit: 8 }, 
          grid: { color: "#2b3440" },
          // Forzamos al eje X a mantener el tamaño completo del total de datos
          min: 0,
          max: result._allLabels.length - 1 
        },
        y: { 
          min: 0,
          max: yMaxAxis, 
          ticks: { color: "#9fb0c2", stepSize: 50 }, 
          grid: { color: "#2b3440" } 
        }
      },
      plugins: { legend: { labels: { color: "#eef2f6" } } }
    },
    plugins: [capacityLinePlugin]
  });
}

function renderLog() {
  if (result && result.config) {
    document.getElementById("tableSeedLabel").textContent = `(Semilla: ${result.config.seed})`;
  }
  const rows = result.moto_log.slice(0, 180).map((row) => `
    <tr>
      <td>${row.id}</td>
      <td><b>${row.control_card}</b></td>
      <td>${row.entry_clock}</td>
      <td>${row.exit_clock ?? "-"}</td>
      <td><span class="status-dot ${statusClass(row.status)}"></span>${assignmentLabel(row.status)}</td>
    </tr>
  `).join("");
  document.getElementById("logBody").innerHTML = rows;
}

async function generateReport() {
  if (!result) return;
  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result)
  });
  const links = await res.json();
  document.getElementById("reportLinks").innerHTML = `
    <a href="${links.html_preview}" target="_blank">Ver informe</a>
    <a href="${links.docx_download}">Descargar Word</a>
    <a href="${links.xlsx_download}">Descargar Excel</a>
  `;
  window.open(links.html_preview, "_blank");
}

function pct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function assignmentLabel(status) {
  if (status === "dentro") return "Asignada";
  if (status === "salio") return "Liberada";
  if (status === "rechazada") return "Rechazada por saturacion";
  return status;
}

function statusClass(status) {
  if (status === "dentro") return "assigned";
  if (status === "salio") return "released";
  if (status === "rechazada") return "rejected";
  return "";
}

function resize() {
  const viewport = document.getElementById("viewport");
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}
