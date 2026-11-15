const STORAGE_KEY = 'mediflow-clinic-data';

const defaultData = {
  appointments: [
    { id: 1, name: 'Ana García', age: 32, doctor: 'Dra. López', time: '09:30', reason: 'Dolor de cabeza frecuente y fatiga.', status: 'Pendiente' },
    { id: 2, name: 'Luis Pérez', age: 52, doctor: 'Dr. Moreno', time: '10:15', reason: 'Control de presión arterial.', status: 'En consulta' },
    { id: 3, name: 'Sofía Ruiz', age: 28, doctor: 'Dra. Castro', time: '11:00', reason: 'Consulta por alergias estacionales.', status: 'Pendiente' },
    { id: 4, name: 'Mateo Díaz', age: 45, doctor: 'Dr. Ruiz', time: '12:30', reason: 'Seguimiento post operatorio.', status: 'Confirmado' }
  ]
};

const statConfig = [
  { title: 'Citas hoy', icon: '📅', color: 'linear-gradient(135deg, #d7eaff, #cfe3ff)', valueKey: 'appointments' },
  { title: 'Pacientes', icon: '👥', color: 'linear-gradient(135deg, #d9f7ec, #cff0e3)', valueKey: 'patients' },
  { title: 'Urgencias', icon: '🚑', color: 'linear-gradient(135deg, #ffe5d9, #ffd7d0)', valueKey: 'emergency' },
  { title: 'Cobertura', icon: '✅', color: 'linear-gradient(135deg, #e6e0ff, #d9d7ff)', valueKey: 'coverage' }
];

const form = document.getElementById('patientForm');
const searchInput = document.getElementById('searchInput');
const statsGrid = document.getElementById('statsGrid');
const appointmentsList = document.getElementById('appointmentsList');
const recordsList = document.getElementById('recordsList');

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
    return structuredClone(defaultData);
  }

  try {
    return JSON.parse(saved);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
    return structuredClone(defaultData);
  }
}

let clinicData = loadData();

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clinicData));
}

function getInitials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');
}

function renderStats() {
  const totalAppointments = clinicData.appointments.length;
  const patientsCount = clinicData.appointments.length;
  const emergencyCount = clinicData.appointments.filter(item => item.status === 'En consulta').length;
  const coverage = Math.min(98, Math.max(86, Math.round((totalAppointments / 5) * 100)));

  const stats = [
    { title: 'Citas hoy', value: totalAppointments, trend: '+12%' },
    { title: 'Pacientes', value: patientsCount, trend: '+8%' },
    { title: 'Urgencias', value: emergencyCount, trend: '-3%' },
    { title: 'Cobertura', value: `${coverage}%`, trend: '+5%' }
  ];

  statsGrid.innerHTML = stats.map((item, index) => {
    const config = statConfig[index];
    return `
      <article class="stat-card">
        <div class="stat-icon" style="background:${config.color}">${config.icon}</div>
        <h3>${item.title}</h3>
        <div class="stat-value">
          <strong>${item.value}</strong>
          <span class="trend up">${item.trend}</span>
        </div>
      </article>
    `;
  }).join('');
}

function renderAppointments() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = clinicData.appointments.filter(item =>
    item.name.toLowerCase().includes(query) ||
    item.doctor.toLowerCase().includes(query) ||
    item.reason.toLowerCase().includes(query)
  );

  if (!filtered.length) {
    appointmentsList.innerHTML = `
      <div class="appointment-item">
        <div class="appointment-meta">
          <h4>No se encontraron citas</h4>
          <p>Prueba otra búsqueda o agrega una nueva cita.</p>
        </div>
      </div>
    `;
    return;
  }

  appointmentsList.innerHTML = filtered.map(item => {
    const badgeClass = item.status === 'Pendiente' ? 'warning' : item.status === 'En consulta' ? 'success' : '';
    return `
      <div class="appointment-item">
        <div class="avatar">${getInitials(item.name)}</div>
        <div class="appointment-meta">
          <h4>${item.name}</h4>
          <p>${item.time} · ${item.doctor} · ${item.reason}</p>
        </div>
        <span class="badge ${badgeClass}">${item.status}</span>
      </div>
    `;
  }).join('');
}

function renderRecords() {
  recordsList.innerHTML = clinicData.appointments.map(item => `
    <article class="record-card">
      <div>
        <h4>${item.name}</h4>
        <p>${item.reason}</p>
        <div class="meta">
          <span>${item.age} años</span>
          <span>${item.doctor}</span>
          <span>${item.time}</span>
        </div>
      </div>
      <button class="status-action" data-id="${item.id}">${item.status === 'Pendiente' ? 'Atender' : 'Revisar'}</button>
    </article>
  `).join('');

  document.querySelectorAll('.status-action').forEach(button => {
    button.addEventListener('click', () => {
      const id = Number(button.dataset.id);
      const item = clinicData.appointments.find(entry => entry.id === id);
      if (!item) return;

      item.status = item.status === 'Pendiente' ? 'En consulta' : 'Confirmado';
      saveData();
      renderAll();
    });
  });
}

function renderAll() {
  renderStats();
  renderAppointments();
  renderRecords();
}

form.addEventListener('submit', event => {
  event.preventDefault();

  const name = document.getElementById('name').value.trim();
  const age = Number(document.getElementById('age').value);
  const doctor = document.getElementById('doctor').value;
  const time = document.getElementById('time').value;
  const reason = document.getElementById('reason').value.trim();

  if (!name || !age || !time || !reason) return;

  const newAppointment = {
    id: Date.now(),
    name,
    age,
    doctor,
    time,
    reason,
    status: 'Pendiente'
  };

  clinicData.appointments.unshift(newAppointment);
  saveData();
  form.reset();
  renderAll();
});

document.getElementById('clearForm').addEventListener('click', () => form.reset());
searchInput.addEventListener('input', renderAppointments);

document.querySelector('.emergency-btn').addEventListener('click', () => {
  const emergencyPatient = {
    id: Date.now(),
    name: 'Paciente de urgencia',
    age: 0,
    doctor: 'Equipo de guardia',
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    reason: 'Atención inmediata requerida.',
    status: 'En consulta'
  };

  clinicData.appointments.unshift(emergencyPatient);
  saveData();
  renderAll();
});

renderAll();



















































































