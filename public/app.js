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
    if (state.current === 'evaluations') renderPlaceholder('Evaluaciones', 'Aqui configuraremos parciales por carrera y categorias/evaluaciones por grupo-materia.');
    if (state.current === 'grades') renderPlaceholder('Calificaciones', 'Aqui ira la matriz dinamica de notas por carrera, grupo, materia, parcial, categorias y evaluaciones.');
    if (state.current === 'reports') renderPlaceholder('Reportes', 'Aqui construiremos resumen general, detalle por parcial y kardex del estudiante.');
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

function renderPlaceholder(title, description) {
    const content = document.getElementById('content');
    content.innerHTML = `
        ${pageHeader(title, description, 'Proxima fase')}
        <article class="card">
            <div class="card-header"><h3>Modulo preparado</h3></div>
            <div class="card-body">
                <p>La estructura V3 ya contempla las tablas necesarias para este modulo. En la siguiente fase conectaremos su interfaz y reglas especificas.</p>
                <table>
                    <tbody>
                        <tr><td><strong>Evaluaciones</strong></td><td>Parciales por carrera, categorias por grupo-materia y evaluaciones por categoria.</td></tr>
                        <tr><td><strong>Calificaciones</strong></td><td>Matriz dinamica, notas 0-100 y conversion al porcentaje del parcial.</td></tr>
                        <tr><td><strong>Reportes</strong></td><td>Resumen general, detalle por parcial y kardex estudiante.</td></tr>
                    </tbody>
                </table>
            </div>
        </article>
    `;
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
