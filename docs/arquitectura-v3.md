# Sistema de Calificaciones V3

## Objetivo

Construir una version limpia del sistema, orientada a gestion academica docente, con una base de datos preparada para crecer sin depender de hojas Excel ni configuraciones sueltas.

## Modulos

- Sedes: nombre, direccion opcional y estado.
- Carreras: pertenecen a una o varias sedes, tienen tipo academico, duracion, facultad opcional y codigo opcional.
- Materias: pertenecen a una carrera y a un grado academico concreto: anio, semestre o modulo.
- Gestion academica: separa gestion y periodo.
- Grupos: pertenecen a una sede, carrera, gestion, periodo y grado; heredan materias del grado seleccionado.
- Estudiantes: datos personales basicos e historial de inscripciones.
- Evaluaciones: parciales globales por carrera; categorias y evaluaciones por asignacion grupo-materia.
- Calificaciones: registro de notas por estudiante y evaluacion.
- Reportes: resumen general, detalle por parcial y kardex estudiante.
- Usuarios: superadministrador y docente.

## Regla central

La carrera define la estructura academica. El grupo no debe inventar materias manualmente; al crearse con carrera y grado, el sistema genera sus asignaciones grupo-materia desde las materias definidas para ese grado.

## Interfaz

La V3 usa una interfaz administrativa profesional:

- Sidebar izquierdo para modulos.
- Topbar con usuario, gestion activa y acciones.
- Area central por modulo.
- Tablas limpias, filtros y formularios laterales.
- Diseno claro, sobrio y legible para trabajo diario.

## Fases

1. Base tecnica: Docker, Express, MySQL, autenticacion, layout.
2. CRUD academico: sedes, carreras, materias, grupos y estudiantes.
3. Evaluaciones reales: parciales, categorias, evaluaciones y cierres.
4. Calificaciones dinamicas.
5. Reportes institucionales y kardex.
6. Refinamiento de roles, permisos e historicos.
