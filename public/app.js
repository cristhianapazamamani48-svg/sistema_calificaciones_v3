const app = document.getElementById('app');
const TOKEN_KEY = 'calificaciones_v3_token';
const USER_KEY = 'calificaciones_v3_user';

const modules = [
    { id: 'dashboard', label: 'Dashboard', icon: 'DB' },
    { id: 'campuses', label: 'Sedes', icon: 'SD' },
    { id: 'careers', label: 'Carreras', icon: 'CR' },
    { id: 'subjects', label: 'Materias', icon: 'MT' },
    { id: 'groups', label: 'Grupos', icon: 'GP' },
    { id: 'students', label: 'Estudiantes', icon: 'ES' },
    { id: 'evaluations', label: 'Evaluaciones', icon: 'EV' },
    { id: 'grades', label: 'Calificaciones', icon: 'NT' },
    { id: 'reports', label: 'Reportes', icon: 'RP' }
];

const state = {
    current: 'dashboard',
    user: readJson(USER_KEY),
    summary: {},
    campuses: [],
    careers: [],
    subjects: [],
    years: [],
    groups: [],
    students: [],
    assignments: []
};

function readJson(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function token() {
    return localStorage.getItem(TOKEN_KEY);
}

async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        logout();
        return response;
    }
    return response;
}

async function requestJson(url, options) {
    const response = await apiFetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la accion');
    return data;
}

function toast(message) {
    const box = document.createElement('div');
    box.className = 'toast';
    box.textContent = message;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2800);
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    state.user = null;
    renderLogin();
}

function renderLogin() {
    app.innerHTML = `
        <main class="login-page">
            <section class="login-brand">
                <div class="brand">
                    <div class="brand-mark">V3</div>
                    <div>
                        <strong>Sistema de Calificaciones</strong>
                        <span>Gestion academica docente</span>
                    </div>
                </div>
                <div>
                    <p class="eyebrow">Version 3</p>
                    <h1>Una base nueva para administrar sedes, carreras, grupos, evaluaciones y notas.</h1>
                    <p>Esta version esta pensada para crecer con reglas academicas reales: carreras por sede, materias por grado, grupos que heredan materias y reportes historicos.</p>
                </div>
                <p>Puerto sugerido para servidor local: 7002</p>
            </section>
            <section class="login-card-wrap">
                <form id="loginForm" class="login-card">
                    <h2>Acceso al sistema</h2>
                    <p>Usuario inicial: admin / 1234</p>
                    <div class="form-grid">
                        <label>Usuario
                            <input id="username" value="admin" autocomplete="username" required>
                        </label>
                        <label>Contrasena
                            <input id="password" type="password" value="1234" autocomplete="current-password" required>
                        </label>
                        <button class="button primary" type="submit">Ingresar</button>
                    </div>
                </form>
            </section>
        </main>
    `;

    document.getElementById('loginForm').addEventListener('submit', handleLogin);
}

async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesion');

        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        state.user = data.user;
        await loadAll();
        renderShell();
    } catch (error) {
        toast(error.message);
    }
}

async function loadAll() {
    const [summary, campuses, careers, subjects, years, groups, students, assignments] = await Promise.all([
        requestJson('/api/dashboard/summary'),
        requestJson('/api/campuses'),
        requestJson('/api/careers'),
        requestJson('/api/subjects'),
        requestJson('/api/academic-years'),
        requestJson('/api/groups'),
        requestJson('/api/students'),
        requestJson('/api/assignments')
    ]);

    Object.assign(state, { summary, campuses, careers, subjects, years, groups, students, assignments });
}

function renderShell() {
    app.innerHTML = `
        <div class="app-shell">
            <aside class="sidebar">
                <div>
                    <div class="brand">
                        <div class="brand-mark">V3</div>
                        <div>
                            <strong>Calificaciones</strong>
                            <span>Infocal / Gestion docente</span>
                        </div>
                    </div>
                    <div class="nav-section-title">Modulos</div>
                    <nav>
                        ${modules.map((item) => `
                            <button class="nav-button ${state.current === item.id ? 'active' : ''}" data-module="${item.id}">
                                <span class="nav-icon">${item.icon}</span>
                                <span>${item.label}</span>
                            </button>
                        `).join('')}
                    </nav>
                </div>
                <div class="sidebar-footer">
                    <button class="nav-button" id="logoutButton">
                        <span class="nav-icon">SA</span>
                        <span>Salir</span>
                    </button>
                </div>
            </aside>
            <section class="main">
                <header class="topbar">
                    <div>
                        <h1>${pageTitle()}</h1>
                        <small>Gestion activa: 2026 | Base V3</small>
                    </div>
                    <div class="user-pill">
                        <span class="user-avatar">${escapeHtml((state.user?.full_name || 'U').slice(0, 1))}</span>
                        <span>${escapeHtml(state.user?.full_name || 'Usuario')} · ${escapeHtml(state.user?.role || '')}</span>
                    </div>
                </header>
                <main class="content" id="content"></main>
            </section>
        </div>
    `;

    document.querySelectorAll('[data-module]').forEach((button) => {
        button.addEventListener('click', async () => {
            state.current = button.dataset.module;
            renderShell();
        });
    });
    document.getElementById('logoutButton').addEventListener('click', logout);
    renderCurrentModule();
}

function pageTitle() {
    return modules.find((item) => item.id === state.current)?.label || 'Dashboard';
}

function pageHeader(title, description, eyebrow = 'Modulo') {
    return `
        <div class="page-header">
            <div>
                <div class="eyebrow">${eyebrow}</div>
                <h2>${title}</h2>
                <p>${description}</p>
            </div>
        </div>
    `;
}

function renderCurrentModule() {
    if (state.current === 'dashboard') renderDashboard();
    if (state.current === 'campuses') renderCampuses();
    if (state.current === 'careers') renderCareers();
    if (state.current === 'subjects') renderSubjects();
    if (state.current === 'groups') renderGroups();
    if (state.current === 'students') renderStudents();
    if (state.current === 'evaluations') renderEvaluations();
    if (state.current === 'grades') renderGrades();
    if (state.current === 'reports') renderReports();
}

function stat(label, value, note) {
    return `
        <article class="card stat-card">
            <div class="stat-label">${label}</div>
            <div class="stat-value">${value}</div>
            <div class="stat-note">${note}</div>
        </article>
    `;
}

function renderDashboard() {
    const content = document.getElementById('content');
    content.innerHTML = `
        ${pageHeader('Panel principal', 'Vista inicial del estado academico del sistema V3.', 'Inicio')}
        <section class="grid stats">
            ${stat('Sedes activas', state.summary.campuses || 0, 'Entidades independientes')}
            ${stat('Carreras', state.summary.careers || 0, 'Con sedes asociadas')}
            ${stat('Materias', state.summary.subjects || 0, 'Por carrera y grado')}
            ${stat('Grupos', state.summary.groups || 0, 'Con materias heredadas')}
        </section>
        <section class="grid two">
            <article class="card">
                <div class="card-header">
                    <h3>Flujo correcto V3</h3>
                </div>
                <div class="card-body">
                    <table>
                        <tbody>
                            <tr><td><strong>1</strong></td><td>Crear sedes.</td></tr>
                            <tr><td><strong>2</strong></td><td>Crear carreras y asociarlas a sedes.</td></tr>
                            <tr><td><strong>3</strong></td><td>Crear materias por carrera y grado.</td></tr>
                            <tr><td><strong>4</strong></td><td>Crear grupos para que hereden materias.</td></tr>
                            <tr><td><strong>5</strong></td><td>Inscribir estudiantes al grupo completo.</td></tr>
                        </tbody>
                    </table>
                </div>
            </article>
            <article class="card">
                <div class="card-header">
                    <h3>Ultimos grupos</h3>
                </div>
                <div class="table-wrap">
                    ${renderGroupsTable(state.groups.slice(0, 6))}
                </div>
            </article>
        </section>
    `;
}

function renderCampuses() {
    const content = document.getElementById('content');
    content.innerHTML = `
        ${pageHeader('Sedes', 'Administra las sedes como entidades independientes.', 'Configuracion academica')}
        <section class="grid two">
            <article class="card">
                <div class="card-header"><h3>Nueva sede</h3></div>
                <div class="card-body">
                    <form id="campusForm" class="form-grid">
                        <label>Nombre <input name="name" placeholder="Sede El Alto" required></label>
                        <label>Direccion <input name="address" placeholder="Opcional"></label>
                        <label>Estado
                            <select name="status">
                                <option value="activo">Activo</option>
                                <option value="inactivo">Inactivo</option>
                            </select>
                        </label>
                        <button class="button primary">Crear sede</button>
                    </form>
                </div>
            </article>
            <article class="card">
                <div class="card-header"><h3>Sedes registradas</h3></div>
                <div class="table-wrap">${renderCampusesTable()}</div>
            </article>
        </section>
    `;
    document.getElementById('campusForm').addEventListener('submit', submitCampus);
}

function renderCampusesTable() {
    if (state.campuses.length === 0) return '<div class="empty">No hay sedes registradas.</div>';
    return `
        <table>
            <thead><tr><th>Sede</th><th>Direccion</th><th>Estado</th></tr></thead>
            <tbody>
                ${state.campuses.map((campus) => `
                    <tr>
                        <td><strong>${escapeHtml(campus.name)}</strong></td>
                        <td>${escapeHtml(campus.address || 'Sin direccion')}</td>
                        <td><span class="badge ${campus.status === 'activo' ? 'ok' : 'warn'}">${escapeHtml(campus.status)}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function submitCampus(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    await requestJson('/api/campuses', { method: 'POST', body: JSON.stringify(data) });
    toast('Sede creada');
    await loadAll();
    renderCampuses();
}

function renderCareers() {
    const content = document.getElementById('content');
    content.innerHTML = `
        ${pageHeader('Carreras', 'Una carrera puede existir en varias sedes y define su tipo academico.', 'Configuracion academica')}
        <section class="grid two">
            <article class="card">
                <div class="card-header"><h3>Nueva carrera</h3></div>
                <div class="card-body">
                    <form id="careerForm" class="form-grid">
                        <label>Nombre <input name="name" placeholder="Sistemas Informaticos" required></label>
                        <label>Codigo <input name="code" placeholder="Opcional"></label>
                        <label>Facultad <input name="faculty" placeholder="Opcional"></label>
                        <label>Tipo academico
                            <select name="academic_type">
                                <option value="anual">Anual</option>
                                <option value="semestral">Semestral</option>
                                <option value="modular">Modular</option>
                            </select>
                        </label>
                        <label>Duracion <input name="duration" type="number" min="1" value="3" required></label>
                        <div>
                            <div class="stat-label">Sedes donde se dicta</div>
                            <div class="checkbox-list">
                                ${state.campuses.map((campus) => `
                                    <label><input type="checkbox" name="campus_ids" value="${campus.id}"> ${escapeHtml(campus.name)}</label>
                                `).join('') || '<span class="empty">Primero crea una sede.</span>'}
                            </div>
                        </div>
                        <button class="button primary">Crear carrera</button>
                    </form>
                </div>
            </article>
            <article class="card">
                <div class="card-header"><h3>Carreras registradas</h3></div>
                <div class="table-wrap">${renderCareersTable()}</div>
            </article>
        </section>
    `;
    document.getElementById('careerForm').addEventListener('submit', submitCareer);
}

function renderCareersTable() {
    if (state.careers.length === 0) return '<div class="empty">No hay carreras registradas.</div>';
    return `
        <table>
            <thead><tr><th>Carrera</th><th>Tipo</th><th>Duracion</th><th>Sedes</th></tr></thead>
            <tbody>
                ${state.careers.map((career) => `
                    <tr>
                        <td><strong>${escapeHtml(career.name)}</strong><br><span class="stat-note">${escapeHtml(career.code || 'Sin codigo')}</span></td>
                        <td><span class="badge info">${escapeHtml(career.academic_type)}</span></td>
                        <td>${career.duration}</td>
                        <td>${career.campuses.map((campus) => escapeHtml(campus.name)).join(', ') || 'Sin sedes'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function submitCareer(event) {
    event.preventDefault();
    const form = new FormData(event.target);
    const data = Object.fromEntries(form);
    data.campus_ids = form.getAll('campus_ids');
    await requestJson('/api/careers', { method: 'POST', body: JSON.stringify(data) });
    toast('Carrera creada');
    await loadAll();
    renderCareers();
}

function renderSubjects() {
    const content = document.getElementById('content');
    content.innerHTML = `
        ${pageHeader('Materias', 'Cada materia pertenece a una carrera y a un anio, semestre o modulo.', 'Configuracion academica')}
        <section class="grid two">
            <article class="card">
                <div class="card-header"><h3>Nueva materia</h3></div>
                <div class="card-body">
                    <form id="subjectForm" class="form-grid">
                        <label>Carrera
                            <select name="career_id" required>
                                ${state.careers.map((career) => `<option value="${career.id}">${escapeHtml(career.name)}</option>`).join('')}
                            </select>
                        </label>
                        <label>Grado <input name="grade_number" type="number" min="1" value="1" required></label>
                        <label>Nombre <input name="name" required></label>
                        <label>Codigo <input name="code"></label>
                        <label>Nota de aprobacion <input name="passing_score" type="number" min="0" max="100" step="0.01" value="61"></label>
                        <label>Descripcion <textarea name="description" rows="3"></textarea></label>
                        <button class="button primary">Crear materia</button>
                    </form>
                </div>
            </article>
            <article class="card">
                <div class="card-header"><h3>Materias registradas</h3></div>
                <div class="table-wrap">${renderSubjectsTable()}</div>
            </article>
        </section>
    `;
    document.getElementById('subjectForm').addEventListener('submit', submitSubject);
}

function renderSubjectsTable() {
    if (state.subjects.length === 0) return '<div class="empty">No hay materias registradas.</div>';
    return `
        <table>
            <thead><tr><th>Materia</th><th>Carrera</th><th>Grado</th><th>Aprobacion</th></tr></thead>
            <tbody>
                ${state.subjects.map((subject) => `
                    <tr>
                        <td><strong>${escapeHtml(subject.name)}</strong><br><span class="stat-note">${escapeHtml(subject.code || 'Sin codigo')}</span></td>
                        <td>${escapeHtml(subject.career_name)}</td>
                        <td>${subject.grade_number}</td>
                        <td>${subject.passing_score}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function submitSubject(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    await requestJson('/api/subjects', { method: 'POST', body: JSON.stringify(data) });
    toast('Materia creada');
    await loadAll();
    renderSubjects();
}

function renderGroups() {
    const content = document.getElementById('content');
    content.innerHTML = `
        ${pageHeader('Grupos', 'El grupo hereda automaticamente las materias de su carrera y grado.', 'Operacion academica')}
        <section class="grid two">
            <article class="card">
                <div class="card-header"><h3>Nuevo grupo</h3></div>
                <div class="card-body">
                    <form id="groupForm" class="form-grid">
                        <label>Codigo <input name="code" placeholder="SCA29.1" required></label>
                        <label>Nombre <input name="name" placeholder="Primer anio - Maniana" required></label>
                        <label>Carrera
                            <select name="career_id" required>${state.careers.map((career) => `<option value="${career.id}">${escapeHtml(career.name)}</option>`).join('')}</select>
                        </label>
                        <label>Sede
                            <select name="campus_id" required>${state.campuses.map((campus) => `<option value="${campus.id}">${escapeHtml(campus.name)}</option>`).join('')}</select>
                        </label>
                        <label>Gestion
                            <select name="academic_year_id" required>${state.years.map((year) => `<option value="${year.id}">${escapeHtml(year.name)}</option>`).join('')}</select>
                        </label>
                        <label>Grado <input name="grade_number" type="number" min="1" value="1" required></label>
                        <label>Turno
                            <select name="shift"><option value="maniana">Maniana</option><option value="tarde">Tarde</option><option value="noche">Noche</option></select>
                        </label>
                        <label>Modalidad
                            <select name="class_modality"><option value="presencial">Presencial</option><option value="virtual">Virtual</option><option value="semipresencial">Semipresencial</option></select>
                        </label>
                        <button class="button primary">Crear grupo</button>
                    </form>
                </div>
            </article>
            <article class="card">
                <div class="card-header"><h3>Grupos registrados</h3></div>
                <div class="table-wrap">${renderGroupsTable(state.groups)}</div>
            </article>
        </section>
    `;
    document.getElementById('groupForm').addEventListener('submit', submitGroup);
}

function renderGroupsTable(groups) {
    if (!groups || groups.length === 0) return '<div class="empty">No hay grupos registrados.</div>';
    return `
        <table>
            <thead><tr><th>Grupo</th><th>Carrera / Sede</th><th>Grado</th><th>Materias</th></tr></thead>
            <tbody>
                ${groups.map((group) => `
                    <tr>
                        <td><strong>${escapeHtml(group.code)}</strong><br><span class="stat-note">${escapeHtml(group.name)}</span></td>
                        <td>${escapeHtml(group.career_name)}<br><span class="stat-note">${escapeHtml(group.campus_name)}</span></td>
                        <td>${group.grade_number} · ${escapeHtml(group.shift)} · ${escapeHtml(group.class_modality)}</td>
                        <td><span class="badge info">${group.subject_count || 0} heredadas</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function submitGroup(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const result = await requestJson('/api/groups', { method: 'POST', body: JSON.stringify(data) });
    toast(`Grupo creado. Materias heredadas: ${result.inherited_subjects}`);
    await loadAll();
    renderGroups();
}

function renderStudents() {
    const content = document.getElementById('content');
    content.innerHTML = `
        ${pageHeader('Estudiantes', 'Al inscribir un estudiante al grupo, queda vinculado al grupo completo.', 'Operacion academica')}
        <section class="grid two">
            <article class="card">
                <div class="card-header"><h3>Inscribir estudiante</h3></div>
                <div class="card-body">
                    <form id="studentForm" class="form-grid">
                        <label>Nombre <input name="first_name" required></label>
                        <label>Apellido <input name="last_name" required></label>
                        <label>Celular <input name="phone"></label>
                        <label>Grupo
                            <select name="group_id" required>
                                ${state.groups.map((group) => `<option value="${group.id}">${escapeHtml(group.code)} - ${escapeHtml(group.name)}</option>`).join('')}
                            </select>
                        </label>
                        <label>Observaciones <textarea name="notes" rows="3"></textarea></label>
                        <button class="button primary">Inscribir</button>
                    </form>
                </div>
            </article>
            <article class="card">
                <div class="card-header"><h3>Estudiantes registrados</h3></div>
                <div class="table-wrap">${renderStudentsTable()}</div>
            </article>
        </section>
    `;
    document.getElementById('studentForm').addEventListener('submit', submitStudent);
}

function renderStudentsTable() {
    if (state.students.length === 0) return '<div class="empty">No hay estudiantes registrados.</div>';
    return `
        <table>
            <thead><tr><th>Estudiante</th><th>Grupo</th><th>Carrera</th><th>Estado</th></tr></thead>
            <tbody>
                ${state.students.map((student) => `
                    <tr>
                        <td><strong>${escapeHtml(student.full_name)}</strong><br><span class="stat-note">${escapeHtml(student.phone || 'Sin celular')}</span></td>
                        <td>${escapeHtml(student.group_code || 'Sin grupo')}<br><span class="stat-note">${escapeHtml(student.group_name || '')}</span></td>
                        <td>${escapeHtml(student.career_name || 'Sin carrera')}</td>
                        <td><span class="badge ok">${escapeHtml(student.status)}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function submitStudent(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    await requestJson('/api/students', { method: 'POST', body: JSON.stringify(data) });
    toast('Estudiante inscrito');
    await loadAll();
    renderStudents();
}

function assignmentOptions() {
    return state.assignments.map((assignment) => `
        <option value="${assignment.id}">
            ${escapeHtml(assignment.group_code)} - ${escapeHtml(assignment.subject_name)}
        </option>
    `).join('');
}

function careerOptions() {
    return state.careers.map((career) => `
        <option value="${career.id}">${escapeHtml(career.name)}</option>
    `).join('');
}

async function getTermsByCareer(careerId) {
    if (!careerId) return [];
    return requestJson(`/api/terms?career_id=${careerId}`);
}

async function renderEvaluations() {
    const content = document.getElementById('content');
    content.innerHTML = `
        ${pageHeader('Evaluaciones', 'Configura parciales, ponderaciones internas y evaluaciones por grupo-materia.', 'Operacion academica')}
        <section class="grid two">
            <article class="card">
                <div class="card-header"><h3>Crear parcial de carrera</h3></div>
                <div class="card-body">
                    <form id="termForm" class="form-grid">
                        <label>Carrera
                            <select name="career_id" required>${careerOptions()}</select>
                        </label>
                        <label>Nombre del parcial <input name="name" placeholder="1er Parcial" required></label>
                        <label>Valor oficial (%) <input name="percentage" type="number" min="0.01" max="100" step="0.01" value="25" required></label>
                        <label>Orden <input name="term_order" type="number" min="1" value="1" required></label>
                        <button class="button primary">Crear parcial</button>
                    </form>
                </div>
            </article>
            <article class="card">
                <div class="card-header"><h3>Estructura de evaluacion</h3></div>
                <div class="card-body">
                    <div class="form-grid">
                        <label>Grupo y materia
                            <select id="evaluationAssignment">${assignmentOptions()}</select>
                        </label>
                        <label>Parcial
                            <select id="evaluationTerm"></select>
                        </label>
                    </div>
                </div>
            </article>
        </section>
        <section class="grid two module-gap">
            <article class="card">
                <div class="card-header"><h3>Crear categoria</h3><span id="categoryTotal" class="badge info">0%</span></div>
                <div class="card-body">
                    <form id="categoryForm" class="form-grid">
                        <label>Nombre <input name="name" placeholder="Practicas" required></label>
                        <label>Ponderacion (%) <input name="weight_percentage" type="number" min="0.01" max="100" step="0.01" required></label>
                        <button class="button primary">Crear categoria</button>
                    </form>
                    <div id="categoriesBox" class="list-panel"></div>
                </div>
            </article>
            <article class="card">
                <div class="card-header"><h3>Crear evaluacion</h3></div>
                <div class="card-body">
                    <form id="evaluationForm" class="form-grid">
                        <label>Categoria
                            <select name="category_id" id="categorySelect" required></select>
                        </label>
                        <label>Nombre <input name="name" placeholder="Practica 1" required></label>
                        <button class="button primary">Crear evaluacion</button>
                    </form>
                    <div id="evaluationsBox" class="list-panel"></div>
                </div>
            </article>
        </section>
    `;

    document.getElementById('termForm').addEventListener('submit', submitTerm);
    document.getElementById('categoryForm').addEventListener('submit', submitCategory);
    document.getElementById('evaluationForm').addEventListener('submit', submitEvaluation);
    document.getElementById('evaluationAssignment').addEventListener('change', refreshEvaluationTerms);
    document.getElementById('evaluationTerm').addEventListener('change', refreshEvaluationStructure);

    await refreshEvaluationTerms();
}

async function refreshEvaluationTerms() {
    const assignmentSelect = document.getElementById('evaluationAssignment');
    const termSelect = document.getElementById('evaluationTerm');
    const assignment = state.assignments.find((item) => String(item.id) === String(assignmentSelect.value));
    const terms = await getTermsByCareer(assignment?.career_id);

    termSelect.innerHTML = terms.map((term) => `
        <option value="${term.id}">${escapeHtml(term.name)} (${term.percentage}%)</option>
    `).join('');

    await refreshEvaluationStructure();
}

async function refreshEvaluationStructure() {
    const assignmentId = document.getElementById('evaluationAssignment')?.value;
    const termId = document.getElementById('evaluationTerm')?.value;
    const categoriesBox = document.getElementById('categoriesBox');
    const evaluationsBox = document.getElementById('evaluationsBox');
    const categorySelect = document.getElementById('categorySelect');
    const categoryTotal = document.getElementById('categoryTotal');

    if (!assignmentId || !termId) {
        categoriesBox.innerHTML = '<div class="empty">Selecciona grupo-materia y parcial.</div>';
        evaluationsBox.innerHTML = '<div class="empty">Sin evaluaciones.</div>';
        categorySelect.innerHTML = '';
        categoryTotal.textContent = '0%';
        return;
    }

    const [categories, evaluations] = await Promise.all([
        requestJson(`/api/categories?assignment_id=${assignmentId}&term_id=${termId}`),
        requestJson(`/api/evaluations?assignment_id=${assignmentId}&term_id=${termId}`)
    ]);

    const total = categories.reduce((sum, category) => sum + Number(category.weight_percentage), 0);
    categoryTotal.textContent = `${total.toFixed(2)}%`;
    categoryTotal.className = `badge ${Math.abs(total - 100) < 0.001 ? 'ok' : 'warn'}`;

    categorySelect.innerHTML = categories.map((category) => `
        <option value="${category.id}">${escapeHtml(category.name)} (${category.weight_percentage}%)</option>
    `).join('');

    categoriesBox.innerHTML = categories.length ? `
        <table>
            <thead><tr><th>Categoria</th><th>Ponderacion</th></tr></thead>
            <tbody>${categories.map((category) => `
                <tr><td><strong>${escapeHtml(category.name)}</strong></td><td>${category.weight_percentage}%</td></tr>
            `).join('')}</tbody>
        </table>
    ` : '<div class="empty">Todavia no hay categorias.</div>';

    evaluationsBox.innerHTML = evaluations.length ? `
        <table>
            <thead><tr><th>Evaluacion</th><th>Categoria</th><th>Peso categoria</th></tr></thead>
            <tbody>${evaluations.map((evaluation) => `
                <tr>
                    <td><strong>${escapeHtml(evaluation.name)}</strong></td>
                    <td>${escapeHtml(evaluation.category_name)}</td>
                    <td>${evaluation.weight_percentage}%</td>
                </tr>
            `).join('')}</tbody>
        </table>
    ` : '<div class="empty">Todavia no hay evaluaciones.</div>';
}

async function submitTerm(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    await requestJson('/api/terms', { method: 'POST', body: JSON.stringify(data) });
    toast('Parcial creado');
    event.target.reset();
    await refreshEvaluationTerms();
}

async function submitCategory(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    data.assignment_id = document.getElementById('evaluationAssignment').value;
    data.term_id = document.getElementById('evaluationTerm').value;
    await requestJson('/api/categories', { method: 'POST', body: JSON.stringify(data) });
    toast('Categoria creada');
    event.target.reset();
    await refreshEvaluationStructure();
}

async function submitEvaluation(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    await requestJson('/api/evaluations', { method: 'POST', body: JSON.stringify(data) });
    toast('Evaluacion creada');
    event.target.reset();
    await refreshEvaluationStructure();
}

async function renderGrades() {
    const content = document.getElementById('content');
    content.innerHTML = `
        ${pageHeader('Calificaciones', 'Registra notas de 0 a 100 y convierte automaticamente al valor oficial del parcial.', 'Operacion academica')}
        <article class="card">
            <div class="card-header"><h3>Selector de notas</h3><button id="exportGrades" class="button secondary" type="button">Exportar CSV</button></div>
            <div class="card-body">
                <div class="form-row">
                    <label>Grupo y materia
                        <select id="gradeAssignment">${assignmentOptions()}</select>
                    </label>
                    <label>Parcial
                        <select id="gradeTerm"></select>
                    </label>
                    <button id="loadGradebook" class="button primary" type="button">Cargar matriz</button>
                </div>
            </div>
        </article>
        <section id="gradebookBox" class="card module-gap">
            <div class="empty">Selecciona grupo-materia y parcial para cargar calificaciones.</div>
        </section>
    `;

    document.getElementById('gradeAssignment').addEventListener('change', refreshGradeTerms);
    document.getElementById('loadGradebook').addEventListener('click', loadGradebook);
    document.getElementById('exportGrades').addEventListener('click', exportGradebookCsv);
    await refreshGradeTerms();
}

async function refreshGradeTerms() {
    const assignment = state.assignments.find((item) => String(item.id) === String(document.getElementById('gradeAssignment').value));
    const terms = await getTermsByCareer(assignment?.career_id);
    document.getElementById('gradeTerm').innerHTML = terms.map((term) => `
        <option value="${term.id}">${escapeHtml(term.name)} (${term.percentage}%)</option>
    `).join('');
}

async function loadGradebook() {
    const assignmentId = document.getElementById('gradeAssignment').value;
    const termId = document.getElementById('gradeTerm').value;
    const box = document.getElementById('gradebookBox');

    if (!assignmentId || !termId) {
        box.innerHTML = '<div class="empty">Selecciona grupo-materia y parcial.</div>';
        return;
    }

    const gradebook = await requestJson(`/api/gradebook?assignment_id=${assignmentId}&term_id=${termId}`);
    window.currentGradebook = gradebook;
    box.innerHTML = renderGradebookTable(gradebook);
    document.querySelectorAll('[data-grade-input]').forEach((input) => {
        input.addEventListener('change', saveGrade);
        input.addEventListener('input', recalculateGradeRows);
    });
    recalculateGradeRows();
}

function renderGradebookTable(gradebook) {
    const { context, students, evaluations, grades } = gradebook;
    if (students.length === 0) return '<div class="empty">No hay estudiantes activos en este grupo.</div>';
    if (evaluations.length === 0) return '<div class="empty">Este parcial no tiene evaluaciones configuradas.</div>';

    const gradeMap = new Map(grades.map((grade) => [`${grade.student_id}_${grade.evaluation_id}`, grade.score]));
    const grouped = {};
    evaluations.forEach((evaluation) => {
        if (!grouped[evaluation.category_id]) {
            grouped[evaluation.category_id] = {
                name: evaluation.category_name,
                weight: evaluation.weight_percentage,
                count: 0
            };
        }
        grouped[evaluation.category_id].count += 1;
    });

    return `
        <div class="card-header">
            <h3>${escapeHtml(context.group_code)} - ${escapeHtml(context.subject_name)} / ${escapeHtml(context.term_name)}</h3>
            <span class="badge info">Valor oficial ${context.term_percentage}%</span>
        </div>
        <div class="table-wrap">
            <table class="gradebook-table">
                <thead>
                    <tr>
                        <th rowspan="2">Estudiante</th>
                        ${Object.values(grouped).map((category) => `<th colspan="${category.count}">${escapeHtml(category.name)} (${category.weight}%)</th>`).join('')}
                        <th rowspan="2">Nota 100</th>
                        <th rowspan="2">Nota oficial</th>
                        <th rowspan="2">Estado</th>
                    </tr>
                    <tr>${evaluations.map((evaluation) => `<th>${escapeHtml(evaluation.evaluation_name)}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${students.map((student) => `
                        <tr data-student-row="${student.id}">
                            <td><strong>${escapeHtml(student.full_name)}</strong></td>
                            ${evaluations.map((evaluation) => `
                                <td>
                                    <input class="grade-input" data-grade-input data-student="${student.id}" data-evaluation="${evaluation.evaluation_id}" type="number" min="0" max="100" step="0.01" value="${gradeMap.get(`${student.id}_${evaluation.evaluation_id}`) ?? ''}">
                                </td>
                            `).join('')}
                            <td><strong data-internal="${student.id}">0.00</strong></td>
                            <td><strong data-official="${student.id}">0.00</strong></td>
                            <td><span data-result="${student.id}" class="badge warn">Pendiente</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function saveGrade(event) {
    const input = event.target;
    const score = input.value === '' ? 0 : Number(input.value);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
        toast('La nota debe estar entre 0 y 100');
        input.focus();
        return;
    }

    await requestJson('/api/grades', {
        method: 'POST',
        body: JSON.stringify({
            student_id: input.dataset.student,
            evaluation_id: input.dataset.evaluation,
            score
        })
    });
    input.classList.add('saved');
    setTimeout(() => input.classList.remove('saved'), 900);
    toast('Nota guardada');
}

function recalculateGradeRows() {
    const gradebook = window.currentGradebook;
    if (!gradebook) return [];

    const categories = {};
    gradebook.evaluations.forEach((evaluation) => {
        if (!categories[evaluation.category_id]) {
            categories[evaluation.category_id] = {
                weight: Number(evaluation.weight_percentage),
                evaluations: []
            };
        }
        categories[evaluation.category_id].evaluations.push(evaluation);
    });

    return gradebook.students.map((student) => {
        let internal = 0;
        Object.values(categories).forEach((category) => {
            const sum = category.evaluations.reduce((total, evaluation) => {
                const input = document.querySelector(`[data-student="${student.id}"][data-evaluation="${evaluation.evaluation_id}"]`);
                const score = Number(input?.value || 0);
                return total + (Number.isFinite(score) ? score : 0);
            }, 0);
            internal += (sum / category.evaluations.length) * (category.weight / 100);
        });

        const official = internal * (Number(gradebook.context.term_percentage) / 100);
        const required = Number(gradebook.context.passing_score) * (Number(gradebook.context.term_percentage) / 100);
        const result = official >= required ? 'Aprobado' : 'En riesgo';

        document.querySelector(`[data-internal="${student.id}"]`).textContent = internal.toFixed(2);
        document.querySelector(`[data-official="${student.id}"]`).textContent = official.toFixed(2);
        const resultElement = document.querySelector(`[data-result="${student.id}"]`);
        resultElement.textContent = result;
        resultElement.className = `badge ${result === 'Aprobado' ? 'ok' : 'warn'}`;

        return { student: student.full_name, internal, official, result };
    });
}

function exportGradebookCsv() {
    const gradebook = window.currentGradebook;
    if (!gradebook) {
        toast('Primero carga una matriz de notas');
        return;
    }

    const calculated = recalculateGradeRows();
    const headers = ['Estudiante', ...gradebook.evaluations.map((evaluation) => `${evaluation.category_name} - ${evaluation.evaluation_name}`), 'Nota 100', 'Nota oficial', 'Estado'];
    const rows = gradebook.students.map((student, index) => [
        student.full_name,
        ...gradebook.evaluations.map((evaluation) => {
            const input = document.querySelector(`[data-student="${student.id}"][data-evaluation="${evaluation.evaluation_id}"]`);
            return input?.value || '0';
        }),
        calculated[index].internal.toFixed(2),
        calculated[index].official.toFixed(2),
        calculated[index].result
    ]);

    downloadCsv(`calificaciones_${gradebook.context.group_code}_${gradebook.context.term_name}.csv`, [headers, ...rows]);
}

async function renderReports() {
    const content = document.getElementById('content');
    content.innerHTML = `
        ${pageHeader('Reportes', 'Genera resumen imprimible y archivo CSV desde las calificaciones registradas.', 'Reportes academicos')}
        <article class="card">
            <div class="card-header"><h3>Generador de reportes</h3><div class="actions"><button id="printReport" class="button secondary" type="button">Imprimir / PDF</button><button id="exportReport" class="button primary" type="button">Exportar CSV</button></div></div>
            <div class="card-body">
                <div class="form-row">
                    <label>Grupo y materia
                        <select id="reportAssignment">${assignmentOptions()}</select>
                    </label>
                    <label>Parcial
                        <select id="reportTerm"></select>
                    </label>
                    <button id="loadReport" class="button primary" type="button">Generar</button>
                </div>
            </div>
        </article>
        <section id="reportBox" class="report-sheet module-gap">
            <div class="empty">Selecciona grupo-materia y parcial para generar el reporte.</div>
        </section>
    `;

    document.getElementById('reportAssignment').addEventListener('change', refreshReportTerms);
    document.getElementById('loadReport').addEventListener('click', loadReport);
    document.getElementById('printReport').addEventListener('click', () => window.print());
    document.getElementById('exportReport').addEventListener('click', exportReportCsv);
    await refreshReportTerms();
}

async function refreshReportTerms() {
    const assignment = state.assignments.find((item) => String(item.id) === String(document.getElementById('reportAssignment').value));
    const terms = await getTermsByCareer(assignment?.career_id);
    document.getElementById('reportTerm').innerHTML = terms.map((term) => `
        <option value="${term.id}">${escapeHtml(term.name)} (${term.percentage}%)</option>
    `).join('');
}

async function loadReport() {
    const assignmentId = document.getElementById('reportAssignment').value;
    const termId = document.getElementById('reportTerm').value;
    if (!assignmentId || !termId) {
        document.getElementById('reportBox').innerHTML = '<div class="empty">Selecciona grupo-materia y parcial.</div>';
        return;
    }

    const gradebook = await requestJson(`/api/gradebook?assignment_id=${assignmentId}&term_id=${termId}`);
    window.currentReport = gradebook;
    document.getElementById('reportBox').innerHTML = renderReportSheet(gradebook);
}

function renderReportSheet(gradebook) {
    const rows = calculateReportRows(gradebook);
    const approved = rows.filter((row) => row.result === 'Aprobado').length;
    const risk = rows.length - approved;

    return `
        <div class="report-header">
            <div>
                <h2>Instituto Tecnologico Infocal</h2>
                <p>Reporte de calificaciones por parcial</p>
            </div>
            <div class="report-meta">
                <span>${new Date().toLocaleString()}</span>
                <span>Nota minima: ${gradebook.context.passing_score}</span>
            </div>
        </div>
        <div class="report-context">
            <span><strong>Sede:</strong> ${escapeHtml(gradebook.context.campus_name)}</span>
            <span><strong>Carrera:</strong> ${escapeHtml(gradebook.context.career_name)}</span>
            <span><strong>Grupo:</strong> ${escapeHtml(gradebook.context.group_code)} - ${escapeHtml(gradebook.context.group_name)}</span>
            <span><strong>Materia:</strong> ${escapeHtml(gradebook.context.subject_name)}</span>
            <span><strong>Parcial:</strong> ${escapeHtml(gradebook.context.term_name)}</span>
            <span><strong>Valor oficial:</strong> ${gradebook.context.term_percentage}%</span>
        </div>
        <div class="report-summary">
            <div><strong>${rows.length}</strong><span>Estudiantes</span></div>
            <div><strong>${approved}</strong><span>Aprobados</span></div>
            <div><strong>${risk}</strong><span>En riesgo</span></div>
        </div>
        <table>
            <thead><tr><th>Nro</th><th>Estudiante</th><th>Nota 100</th><th>Nota oficial</th><th>Estado</th></tr></thead>
            <tbody>${rows.map((row, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${escapeHtml(row.student)}</strong></td>
                    <td>${row.internal.toFixed(2)}</td>
                    <td>${row.official.toFixed(2)}</td>
                    <td>${row.result}</td>
                </tr>
            `).join('') || '<tr><td colspan="5">No hay estudiantes.</td></tr>'}</tbody>
        </table>
    `;
}

function calculateReportRows(gradebook) {
    const gradeMap = new Map(gradebook.grades.map((grade) => [`${grade.student_id}_${grade.evaluation_id}`, Number(grade.score)]));
    const categories = {};
    gradebook.evaluations.forEach((evaluation) => {
        if (!categories[evaluation.category_id]) {
            categories[evaluation.category_id] = { weight: Number(evaluation.weight_percentage), evaluations: [] };
        }
        categories[evaluation.category_id].evaluations.push(evaluation);
    });

    return gradebook.students.map((student) => {
        let internal = 0;
        Object.values(categories).forEach((category) => {
            const sum = category.evaluations.reduce((total, evaluation) => {
                const score = gradeMap.get(`${student.id}_${evaluation.evaluation_id}`);
                return total + (Number.isFinite(score) ? score : 0);
            }, 0);
            internal += (sum / category.evaluations.length) * (category.weight / 100);
        });
        const official = internal * (Number(gradebook.context.term_percentage) / 100);
        const required = Number(gradebook.context.passing_score) * (Number(gradebook.context.term_percentage) / 100);
        return { student: student.full_name, internal, official, result: official >= required ? 'Aprobado' : 'En riesgo' };
    });
}

function exportReportCsv() {
    const report = window.currentReport;
    if (!report) {
        toast('Primero genera un reporte');
        return;
    }

    const rows = calculateReportRows(report);
    downloadCsv(`reporte_${report.context.group_code}_${report.context.term_name}.csv`, [
        ['Estudiante', 'Nota 100', 'Nota oficial', 'Estado'],
        ...rows.map((row) => [row.student, row.internal.toFixed(2), row.official.toFixed(2), row.result])
    ]);
}

function downloadCsv(filename, rows) {
    const cleanName = filename.replace(/[\\/:*?"<>|]+/g, '_');
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = cleanName;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function bootstrap() {
    if (!token()) {
        renderLogin();
        return;
    }

    try {
        const data = await requestJson('/api/auth/me');
        state.user = data.user;
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        await loadAll();
        renderShell();
    } catch (error) {
        logout();
    }
}

bootstrap();
