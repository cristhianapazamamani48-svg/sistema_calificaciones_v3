const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const pool = require('./database');

const app = express();
const AUTH_SECRET = process.env.AUTH_SECRET || 'cambia-este-secreto-en-produccion';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function parseId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function requiredText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function passwordMatches(storedPassword, submittedPassword) {
    return storedPassword === submittedPassword || storedPassword === hashPassword(submittedPassword);
}

function signToken(user) {
    const payload = {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        role: user.role,
        exp: Date.now() + TOKEN_TTL_MS
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
}

function verifyToken(token) {
    try {
        if (!token || !token.includes('.')) return null;
        const [encoded, signature] = token.split('.');
        const expected = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
        const left = Buffer.from(signature);
        const right = Buffer.from(expected);
        if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;

        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
        if (!payload.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch (error) {
        return null;
    }
}

function requireAuth(req, res, next) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = verifyToken(token);

    if (!user) {
        return res.status(401).json({ error: 'Sesion no valida. Inicia sesion nuevamente.' });
    }

    req.user = user;
    next();
}

app.get('/api/estado', (req, res) => {
    res.json({ message: 'Sistema de Calificaciones V3 operativo' });
});

app.post('/api/auth/login', async (req, res) => {
    let connection;
    try {
        const { username, password } = req.body;
        if (!requiredText(username) || !requiredText(password)) {
            return res.status(400).json({ error: 'Usuario y contrasena son obligatorios' });
        }

        connection = await pool.getConnection();
        const [rows] = await connection.query(
            "SELECT id, full_name, username, password, role, status FROM users WHERE username = ? LIMIT 1",
            [username.trim()]
        );

        if (rows.length === 0 || rows[0].status !== 'activo' || !passwordMatches(rows[0].password, password)) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const user = {
            id: rows[0].id,
            full_name: rows[0].full_name,
            username: rows[0].username,
            role: rows[0].role
        };

        res.json({ token: signToken(user), user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

app.use('/api', requireAuth);

app.get('/api/dashboard/summary', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [[campuses]] = await connection.query("SELECT COUNT(*) AS total FROM campuses WHERE status = 'activo'");
        const [[careers]] = await connection.query("SELECT COUNT(*) AS total FROM careers WHERE status = 'activo'");
        const [[subjects]] = await connection.query("SELECT COUNT(*) AS total FROM subjects WHERE status = 'activo'");
        const [[groups]] = await connection.query("SELECT COUNT(*) AS total FROM academic_groups WHERE status = 'activo'");
        const [[students]] = await connection.query("SELECT COUNT(*) AS total FROM students WHERE status = 'activo'");
        const [[assignments]] = await connection.query("SELECT COUNT(*) AS total FROM group_subject_assignments WHERE status = 'activo'");

        res.json({
            campuses: campuses.total,
            careers: careers.total,
            subjects: subjects.total,
            groups: groups.total,
            students: students.total,
            assignments: assignments.total
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/campuses', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query('SELECT * FROM campuses ORDER BY name ASC');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/campuses', async (req, res) => {
    let connection;
    try {
        const { name, address, status = 'activo' } = req.body;
        if (!requiredText(name)) return res.status(400).json({ error: 'El nombre de la sede es obligatorio' });

        connection = await pool.getConnection();
        const [result] = await connection.query(
            'INSERT INTO campuses (name, address, status) VALUES (?, ?, ?)',
            [name.trim(), address || null, status]
        );
        res.status(201).json({ id: result.insertId, message: 'Sede creada' });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'La sede ya existe' });
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/careers', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(`
            SELECT
                c.*,
                COALESCE(JSON_ARRAYAGG(
                    CASE WHEN cc.campus_id IS NULL THEN NULL ELSE JSON_OBJECT('id', ca.id, 'name', ca.name) END
                ), JSON_ARRAY()) AS campuses
            FROM careers c
            LEFT JOIN career_campuses cc ON c.id = cc.career_id
            LEFT JOIN campuses ca ON cc.campus_id = ca.id
            GROUP BY c.id
            ORDER BY c.name ASC
        `);
        res.json(rows.map((row) => {
            const campuses = typeof row.campuses === 'string' ? JSON.parse(row.campuses) : row.campuses;
            return {
                ...row,
                campuses: campuses.filter(Boolean)
            };
        }));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/careers', async (req, res) => {
    let connection;
    try {
        const { name, code, faculty, academic_type, duration, campus_ids = [] } = req.body;
        if (!requiredText(name) || !requiredText(academic_type)) {
            return res.status(400).json({ error: 'Nombre y tipo academico son obligatorios' });
        }
        if (!['anual', 'semestral', 'modular'].includes(academic_type)) {
            return res.status(400).json({ error: 'Tipo academico invalido' });
        }
        if (!Array.isArray(campus_ids) || campus_ids.length === 0) {
            return res.status(400).json({ error: 'Selecciona al menos una sede para la carrera' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query(
            'INSERT INTO careers (name, code, faculty, academic_type, duration) VALUES (?, ?, ?, ?, ?)',
            [name.trim(), code || null, faculty || null, academic_type, Number.parseInt(duration, 10) || 1]
        );

        for (const campusId of campus_ids) {
            const id = parseId(campusId);
            if (id) {
                await connection.query('INSERT IGNORE INTO career_campuses (career_id, campus_id) VALUES (?, ?)', [result.insertId, id]);
            }
        }

        await connection.commit();
        res.status(201).json({ id: result.insertId, message: 'Carrera creada' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/subjects', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(`
            SELECT s.*, c.name AS career_name, c.academic_type
            FROM subjects s
            JOIN careers c ON s.career_id = c.id
            ORDER BY c.name ASC, s.grade_number ASC, s.name ASC
        `);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/subjects', async (req, res) => {
    let connection;
    try {
        const { career_id, name, code, description, passing_score, grade_number } = req.body;
        const careerId = parseId(career_id);
        const gradeNumber = parseId(grade_number);
        if (!careerId || !gradeNumber || !requiredText(name)) {
            return res.status(400).json({ error: 'Carrera, grado y nombre de materia son obligatorios' });
        }

        connection = await pool.getConnection();
        const [result] = await connection.query(
            'INSERT INTO subjects (career_id, name, code, description, passing_score, grade_number) VALUES (?, ?, ?, ?, ?, ?)',
            [careerId, name.trim(), code || null, description || null, Number.parseFloat(passing_score) || 61, gradeNumber]
        );
        res.status(201).json({ id: result.insertId, message: 'Materia creada' });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'La materia ya existe para ese grado' });
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/academic-years', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query('SELECT * FROM academic_years ORDER BY year_number DESC');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/groups', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(`
            SELECT
                g.*,
                c.name AS career_name,
                c.academic_type,
                ca.name AS campus_name,
                ay.name AS academic_year_name,
                COUNT(gsa.id) AS subject_count
            FROM academic_groups g
            JOIN careers c ON g.career_id = c.id
            JOIN campuses ca ON g.campus_id = ca.id
            JOIN academic_years ay ON g.academic_year_id = ay.id
            LEFT JOIN group_subject_assignments gsa ON g.id = gsa.group_id
            GROUP BY g.id
            ORDER BY ay.year_number DESC, g.code ASC
        `);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/groups', async (req, res) => {
    let connection;
    try {
        const { code, name, career_id, campus_id, academic_year_id, grade_number, shift, class_modality } = req.body;
        const careerId = parseId(career_id);
        const campusId = parseId(campus_id);
        const academicYearId = parseId(academic_year_id);
        const gradeNumber = parseId(grade_number);

        if (!requiredText(code) || !requiredText(name) || !careerId || !campusId || !academicYearId || !gradeNumber) {
            return res.status(400).json({ error: 'Completa codigo, nombre, carrera, sede, gestion y grado' });
        }
        if (!['maniana', 'tarde', 'noche'].includes(shift)) return res.status(400).json({ error: 'Turno invalido' });
        if (!['presencial', 'virtual', 'semipresencial'].includes(class_modality)) return res.status(400).json({ error: 'Modalidad invalida' });

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query(
            `INSERT INTO academic_groups
             (code, name, career_id, campus_id, academic_year_id, grade_number, shift, class_modality)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [code.trim(), name.trim(), careerId, campusId, academicYearId, gradeNumber, shift, class_modality]
        );

        const [subjects] = await connection.query(
            'SELECT id FROM subjects WHERE career_id = ? AND grade_number = ? AND status = "activo"',
            [careerId, gradeNumber]
        );

        for (const subject of subjects) {
            await connection.query(
                'INSERT IGNORE INTO group_subject_assignments (group_id, subject_id, teacher_id) VALUES (?, ?, ?)',
                [result.insertId, subject.id, req.user.id]
            );
        }

        await connection.commit();
        res.status(201).json({
            id: result.insertId,
            inherited_subjects: subjects.length,
            message: 'Grupo creado con materias heredadas'
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe un grupo con ese codigo' });
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/assignments', async (req, res) => {
    let connection;
    try {
        const groupId = parseId(req.query.group_id);
        connection = await pool.getConnection();
        const params = [];
        let where = '';
        if (groupId) {
            where = 'WHERE gsa.group_id = ?';
            params.push(groupId);
        }

        const [rows] = await connection.query(`
            SELECT
                gsa.*,
                g.code AS group_code,
                g.name AS group_name,
                s.name AS subject_name,
                s.passing_score,
                c.name AS career_name,
                ca.name AS campus_name
            FROM group_subject_assignments gsa
            JOIN academic_groups g ON gsa.group_id = g.id
            JOIN subjects s ON gsa.subject_id = s.id
            JOIN careers c ON g.career_id = c.id
            JOIN campuses ca ON g.campus_id = ca.id
            ${where}
            ORDER BY g.code ASC, s.name ASC
        `, params);

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/students', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(`
            SELECT
                s.*,
                CONCAT(s.first_name, ' ', s.last_name) AS full_name,
                g.code AS group_code,
                g.name AS group_name,
                c.name AS career_name
            FROM students s
            LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'activo'
            LEFT JOIN academic_groups g ON e.group_id = g.id
            LEFT JOIN careers c ON e.career_id = c.id
            ORDER BY s.last_name ASC, s.first_name ASC
        `);
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/students', async (req, res) => {
    let connection;
    try {
        const { first_name, last_name, phone, notes, group_id } = req.body;
        const groupId = parseId(group_id);
        if (!requiredText(first_name) || !requiredText(last_name) || !groupId) {
            return res.status(400).json({ error: 'Nombre, apellido y grupo son obligatorios' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [[group]] = await connection.query(
            'SELECT id, career_id, academic_year_id FROM academic_groups WHERE id = ? LIMIT 1',
            [groupId]
        );
        if (!group) {
            await connection.rollback();
            return res.status(404).json({ error: 'Grupo no encontrado' });
        }

        const [student] = await connection.query(
            'INSERT INTO students (first_name, last_name, phone, notes) VALUES (?, ?, ?, ?)',
            [first_name.trim(), last_name.trim(), phone || null, notes || null]
        );

        await connection.query(
            'INSERT INTO enrollments (student_id, group_id, career_id, academic_year_id) VALUES (?, ?, ?, ?)',
            [student.insertId, group.id, group.career_id, group.academic_year_id]
        );

        await connection.commit();
        res.status(201).json({ id: student.insertId, message: 'Estudiante inscrito al grupo completo' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Sistema de Calificaciones V3 corriendo en puerto ${PORT}`);
});
