# Sistema de Calificaciones V3 — Documentación de Arquitectura

> **Última actualización:** Julio 2026  
> **Entorno de producción:** Railway (Node + MySQL)  
> **Repositorio:** github.com/cristhianapazamamani48-svg/sistema_calificaciones_v3

---

## 1. Objetivo del Sistema

Sistema de gestión académica docente diseñado para registrar sedes, carreras, materias, grupos, estudiantes, evaluaciones y calificaciones. Reemplaza hojas Excel y configuraciones sueltas por una base de datos relacional estructurada y una interfaz web profesional.

El sistema **no registra estudiantes directamente**; el docente inscribe a los estudiantes en grupos ya configurados. El CI es opcional por esta razón. Si existen dos estudiantes con el mismo nombre, el CI sirve como diferenciador.

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express.js |
| Base de datos | MySQL 8 |
| Frontend | HTML + Vanilla JS + CSS (sin framework) |
| Autenticación | Token propio HMAC-SHA256 (sin JWT externo) |
| Contenedor | Docker + docker-compose |
| Despliegue | Railway (servidor) + GitHub (CI automático) |

---

## 3. Estructura de Archivos

```
sistema_calificaciones_v3/
├── server.js              # API REST completa (Express)
├── database.js            # Inicialización de tablas + seeds iniciales
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env / .env.example
├── docs/
│   └── arquitectura-v3.md  # Este documento
└── public/
    ├── index.html
    ├── app.js             # SPA completa (frontend)
    └── style.css          # Estilos globales
```

---

## 4. Esquema de Base de Datos

### 4.1 Tablas principales

```
users
  id, full_name, username, password,
  role ENUM('superadministrador','docente'),
  status ENUM('activo','inactivo')

campuses
  id, name, address, status ENUM('activo','inactivo')

careers
  id, name, code, faculty,
  academic_type ENUM('anual','semestral','modular'),
  duration, status

career_campuses             -- relación carrera ↔ sede
  id, career_id, campus_id  (UNIQUE)

subjects
  id, career_id, name, code, description,
  passing_score, grade_number, status

academic_years
  id, name, year_number, status ENUM('activo','cerrado')

academic_periods
  id, academic_year_id, name, start_date, end_date, status

academic_groups
  id, code, name, career_id, campus_id,
  academic_year_id, grade_number,
  shift ENUM('maniana','tarde','noche'),
  class_modality ENUM('presencial','virtual','semipresencial')

group_subject_assignments    -- asignaciones grupo ↔ materia ↔ docente
  id, group_id, subject_id, teacher_id

students
  id, first_name, last_name, ci (nullable), email, phone,
  status ENUM('activo','retirado','abandono','egresado','reprobo')

enrollments                  -- inscripciones de estudiante en grupo
  id, student_id, group_id, status, enrolled_at

terms                        -- parciales por carrera
  id, career_id, name, percentage, order_number

evaluation_categories        -- categorías (p.ej. Tareas, Exámenes)
  id, assignment_id, term_id, name, weight

evaluations                  -- evaluaciones individuales
  id, category_id, name, max_score

evaluation_grades            -- notas de cada estudiante
  id, evaluation_id, student_id, score

student_deletion_requests    -- solicitudes de baja con causa
  id, student_id, user_id, reason,
  status ENUM('pendiente','aprobada','rechazada')
```

### 4.2 Regla central de herencia

> Cuando se crea un **Grupo** con una Carrera y un Grado, el sistema genera automáticamente las asignaciones `group_subject_assignments` desde todas las materias activas de ese grado/carrera. El docente **no configura materias manualmente** por grupo.

### 4.3 Formato de nombres

Los nombres completos se concatenan como **Apellido + Nombre** en todas las consultas (`CONCAT(last_name, ' ', first_name) AS full_name`) para que el orden alfabético sea coherente con la vista.

---

## 5. Autenticación y Roles

- Token propio firmado con **HMAC-SHA256** (sin dependencia de jwt). Se codifica en `base64url` y se valida en cada request con `requireAuth`.
- Endpoint `/api/auth/me` para restaurar la sesión al recargar la página.

### Roles

| Rol | Permisos |
|---|---|
| `docente` | CRUD de estudiantes, evaluaciones, calificaciones. **No puede eliminar estudiantes**, solo solicitar la baja con causa. |
| `superadministrador` | Todo lo anterior + eliminar estudiantes permanentemente + aprobar/rechazar solicitudes de baja + ver módulo "Solicitudes" en el menú. |

---

## 6. API REST — Endpoints

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login, devuelve token |
| GET | `/api/auth/me` | Devuelve usuario autenticado |

### Configuración académica
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/campuses` | Lista sedes |
| POST | `/api/campuses` | Crear sede |
| PUT | `/api/campuses/:id` | Editar sede (nombre, dirección, estado) |
| GET | `/api/careers` | Lista carreras con sedes |
| POST | `/api/careers` | Crear carrera + asignar sedes |
| PUT | `/api/careers/:id` | Editar carrera (nombre, código, facultad, tipo, duración) |
| GET | `/api/subjects` | Lista materias |
| POST | `/api/subjects` | Crear materia |
| PUT | `/api/subjects/:id` | Editar materia (nombre, código, grado, nota aprobación) |
| GET | `/api/groups` | Lista grupos |
| POST | `/api/groups` | Crear grupo + herencia automática de materias |
| PUT | `/api/groups/:id` | Editar grupo (código, nombre, turno, modalidad) |

> **Nota:** Al editar Grupos, **no** se permite cambiar Carrera ni Sede para proteger la integridad de las asignaciones y calificaciones existentes.

### Gestión académica
| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/academic-years` | Gestiones |
| GET/POST | `/api/academic-periods` | Períodos por gestión |
| GET | `/api/assignments` | Asignaciones grupo-materia del docente |

### Estudiantes
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/students` | Lista estudiantes (con filtros) |
| POST | `/api/students` | Inscribir estudiante |
| PUT | `/api/students/:id` | Editar datos (nombre, CI, email, teléfono) |
| PUT | `/api/students/:id/status` | Cambiar estado (dar de baja, reactivar) |
| POST | `/api/students/:id/transfer` | Transferir a otro grupo |
| DELETE | `/api/students/:id` | Eliminar permanentemente (**solo superadmin**) |
| POST | `/api/students/:id/delete_request` | Solicitar baja con causa (docente) |

### Solicitudes de baja
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/deletion_requests` | Lista solicitudes (**solo superadmin**) |
| PUT | `/api/deletion_requests/:id/resolve` | Aprobar o rechazar solicitud (**solo superadmin**) |

### Evaluaciones y calificaciones
| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/terms` | Parciales por carrera |
| GET/POST | `/api/categories` | Categorías de evaluación |
| GET/POST | `/api/evaluations` | Evaluaciones individuales |
| DELETE | `/api/categories/:id` | Eliminar categoría (elimina notas en cascada) |
| GET | `/api/grades` | Matriz de calificaciones |
| POST | `/api/grades/batch` | Guardar notas en lote |
| GET | `/api/reports/gradebook` | Reporte por parcial |
| POST | `/api/categories/clone` | Clonar estructura de categorías entre grupos |

---

## 7. Frontend (SPA)

La interfaz es una **Single Page Application** sin framework. Todo el estado se mantiene en el objeto global `state` y la navegación se realiza reemplazando el contenido del `#content`.

### Módulos del menú
| ID | Nombre | Visible para |
|---|---|---|
| `dashboard` | Dashboard | Todos |
| `campuses` | Sedes | Todos |
| `careers` | Carreras | Todos |
| `subjects` | Materias | Todos |
| `groups` | Grupos | Todos |
| `students` | Estudiantes | Todos |
| `evaluations` | Evaluaciones | Todos |
| `grades` | Calificaciones | Todos |
| `reports` | Reportes | Todos |
| `solicitudes` | Solicitudes | **Solo superadministrador** |

### Estado global (`state`)
```js
{
  current: 'dashboard',   // módulo activo
  user: { id, full_name, role, ... },
  summary: {},            // contadores del dashboard
  campuses: [],
  careers: [],
  subjects: [],
  years: [],
  groups: [],
  students: [],
  assignments: []         // asignaciones grupo-materia del usuario
}
```

### Funciones clave del frontend

| Función | Propósito |
|---|---|
| `openEditModal({ title, fields, onSubmit })` | Modal genérico reutilizable para editar cualquier entidad. Genera campos dinámicamente según el tipo (`text`, `select`, `textarea`, `number`). |
| `assignmentGroupOptions()` | Genera opciones de grupos únicos para selectores en cascada. |
| `updateSubjectOptions(groupId, subjectId)` | Filtra y rellena el selector de materias en función del grupo seleccionado. |
| `applyStudentFilters()` | Filtra la lista de estudiantes en memoria según sede, carrera, grupo, materia, estado y búsqueda de texto. |
| `openSidePanel(html)` | Abre el panel lateral deslizante para editar datos de un estudiante. |
| `deleteStudent(id, name)` | Comportamiento diferenciado según rol: superadmin elimina directamente, docente abre modal de causa. |
| `resolveDeletionRequest(id, status)` | Aprueba o rechaza una solicitud de baja desde el módulo Solicitudes. |

---

## 8. Flujos de Trabajo Principales

### 8.1 Configuración inicial (orden recomendado)
1. Crear **Sedes**
2. Crear **Carreras** → asignar a sedes
3. Crear **Materias** → por carrera y grado
4. Crear **Gestión académica** (año)
5. Crear **Grupos** → heredan materias del grado automáticamente
6. **Inscribir Estudiantes** al grupo

### 8.2 Registro de evaluaciones
1. Ir a **Evaluaciones**
2. Seleccionar **Grupo** (cascada) → **Materia** → **Parcial**
3. Crear categorías (Tareas, Exámenes, etc.) con su peso (%)
4. Crear evaluaciones dentro de cada categoría
5. Opcionalmente **clonar la estructura** de otro grupo

### 8.3 Registro de calificaciones
1. Ir a **Calificaciones**
2. Seleccionar **Grupo** → **Materia** → **Parcial** → **Cargar matriz**
3. Ingresar notas (0-100) en la grilla
4. Guardar con **Guardar notas**; el sistema convierte automáticamente al puntaje oficial del parcial

### 8.4 Solicitud de baja de estudiante
1. **Docente** va a Estudiantes → botón "Solicitar baja"
2. Ingresa la **causa obligatoria** en el modal
3. La solicitud queda con estado `pendiente`
4. **Superadministrador** va a módulo "Solicitudes" → revisa la causa → Aprobar (elimina permanentemente) o Rechazar

---

## 9. Selectores en Cascada (Evaluaciones / Calificaciones / Reportes)

Los tres módulos usan el mismo patrón de selección de dos pasos:

```
[Selector Grupo] → onChange → filtrar asignaciones → [Selector Materia]
```

Esto evita la redundancia de ver el mismo grupo repetido para cada una de sus materias. El primer selector muestra **grupos únicos**; el segundo se repuebla automáticamente con solo las materias que le corresponden al grupo elegido.

---

## 10. Despliegue

- **Desarrollo local:** `docker-compose up` levanta Node + MySQL.
- **Producción:** Railway detecta el `Dockerfile` y despliega automáticamente al hacer `git push` a la rama `main`.
- **Variables de entorno requeridas:** `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `AUTH_SECRET`.
- **Inicialización automática:** `database.js → initializeDatabase()` crea todas las tablas con `CREATE TABLE IF NOT EXISTS` y siembra datos iniciales (usuario superadmin, gestión 2026) si no existen.

### Migraciones seguras para MySQL

Para agregar columnas en producción se usa el patrón `SHOW COLUMNS` en lugar de `ADD COLUMN IF NOT EXISTS` (no compatible con MySQL):

```js
const [cols] = await connection.query("SHOW COLUMNS FROM students LIKE 'ci'");
if (cols.length === 0) {
    await connection.query("ALTER TABLE students ADD COLUMN ci VARCHAR(20) NULL");
}
```

---

## 11. Historial de Cambios Relevantes

| Versión / Fecha | Cambio |
|---|---|
| Base V3 | Arquitectura inicial: Docker, Express, MySQL, autenticación, layout SPA |
| Sprint 1 | CRUD completo: Sedes, Carreras, Materias, Grupos, Estudiantes |
| Sprint 2 | Módulo de Evaluaciones: parciales, categorías, evaluaciones, clonar estructura |
| Sprint 3 | Módulo de Calificaciones con grilla dinámica y conversión a nota oficial |
| Sprint 4 | Módulo de Reportes: resumen por parcial, exportación CSV, impresión |
| Sprint 5 | Campo CI opcional en estudiantes (migración segura con SHOW COLUMNS) |
| Sprint 5 | Botón eliminar estudiante permanentemente desde frontend |
| Sprint 5 | Corrección error de arranque en Railway: `ER_PARSE_ERROR` por sintaxis MySQL incompatible |
| Sprint 6 | Ordenamiento alfabético por Apellido en todas las listas de estudiantes |
| Sprint 7 | Refactor selectores Evaluaciones/Calificaciones/Reportes: cascada Grupo → Materia |
| Sprint 8 | Edición de Sedes, Carreras, Materias y Grupos mediante modal genérico (`openEditModal`) |
| Sprint 8 | Flujo de solicitud de baja por rol: docente solicita con causa, superadmin aprueba/rechaza |
| Sprint 8 | Nuevo módulo "Solicitudes" visible solo para superadministrador |
| Sprint 8 | Restricción del endpoint `DELETE /api/students/:id` a rol superadministrador |
| Sprint 8 | Nueva tabla `student_deletion_requests` en base de datos |
