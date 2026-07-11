const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const { pool, initializeDatabase } = require('./database');

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
                c.id AS career_id,
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

app.get('/api/terms', async (req, res) => {
    let connection;
    try {
        const careerId = parseId(req.query.career_id);
        connection = await pool.getConnection();

        const params = [];
        let where = '';
        if (careerId) {
            where = 'WHERE t.career_id = ?';
            params.push(careerId);
        }

        const [rows] = await connection.query(`
            SELECT t.*, c.name AS career_name
            FROM terms t
            JOIN careers c ON t.career_id = c.id
            ${where}
            ORDER BY c.name ASC, t.term_order ASC
        `, params);

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/terms', async (req, res) => {
    let connection;
    try {
        const { career_id, name, percentage, term_order } = req.body;
        const careerId = parseId(career_id);
        const parsedPercentage = Number.parseFloat(percentage);

        if (!careerId || !requiredText(name) || !Number.isFinite(parsedPercentage) || parsedPercentage <= 0) {
            return res.status(400).json({ error: 'Carrera, nombre y porcentaje son obligatorios' });
        }

        connection = await pool.getConnection();
        const [[total]] = await connection.query(
            'SELECT COALESCE(SUM(percentage), 0) AS total FROM terms WHERE career_id = ?',
            [careerId]
        );

        if (Number(total.total) + parsedPercentage > 100) {
            return res.status(400).json({ error: 'La suma de parciales de la carrera no puede pasar de 100%' });
        }

        const [result] = await connection.query(
            'INSERT INTO terms (career_id, name, percentage, term_order) VALUES (?, ?, ?, ?)',
            [careerId, name.trim(), parsedPercentage, Number.parseInt(term_order, 10) || 1]
        );

        res.status(201).json({ id: result.insertId, message: 'Parcial creado' });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe un parcial con ese nombre para la carrera' });
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/categories', async (req, res) => {
    let connection;
    try {
        const assignmentId = parseId(req.query.assignment_id);
        const termId = parseId(req.query.term_id);
        if (!assignmentId || !termId) {
            return res.status(400).json({ error: 'Selecciona grupo-materia y parcial' });
        }

        connection = await pool.getConnection();
        const [rows] = await connection.query(
            'SELECT * FROM evaluation_categories WHERE assignment_id = ? AND term_id = ? ORDER BY name ASC',
            [assignmentId, termId]
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/categories', async (req, res) => {
    let connection;
    try {
        const { assignment_id, term_id, name, weight_percentage } = req.body;
        const assignmentId = parseId(assignment_id);
        const termId = parseId(term_id);
        const weight = Number.parseFloat(weight_percentage);

        if (!assignmentId || !termId || !requiredText(name) || !Number.isFinite(weight) || weight <= 0) {
            return res.status(400).json({ error: 'Grupo-materia, parcial, nombre y porcentaje son obligatorios' });
        }

        connection = await pool.getConnection();
        const [[total]] = await connection.query(
            'SELECT COALESCE(SUM(weight_percentage), 0) AS total FROM evaluation_categories WHERE assignment_id = ? AND term_id = ?',
            [assignmentId, termId]
        );

        if (Number(total.total) + weight > 100) {
            return res.status(400).json({ error: 'La suma de categorias del parcial no puede pasar de 100%' });
        }

        const [result] = await connection.query(
            'INSERT INTO evaluation_categories (assignment_id, term_id, name, weight_percentage) VALUES (?, ?, ?, ?)',
            [assignmentId, termId, name.trim(), weight]
        );
        res.status(201).json({ id: result.insertId, message: 'Categoria creada' });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe una categoria con ese nombre' });
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.put('/api/categories/:id', async (req, res) => {
    let connection;
    try {
        const id = parseId(req.params.id);
        const { name, weight_percentage } = req.body;
        const weight = Number.parseFloat(weight_percentage);

        if (!id || !requiredText(name) || !Number.isFinite(weight) || weight <= 0) {
            return res.status(400).json({ error: 'ID, nombre y porcentaje valido son obligatorios' });
        }

        connection = await pool.getConnection();
        const [[category]] = await connection.query(
            'SELECT assignment_id, term_id FROM evaluation_categories WHERE id = ?',
            [id]
        );
        if (!category) {
            return res.status(404).json({ error: 'Categoria no encontrada' });
        }

        const [[total]] = await connection.query(
            'SELECT COALESCE(SUM(weight_percentage), 0) AS total FROM evaluation_categories WHERE assignment_id = ? AND term_id = ? AND id != ?',
            [category.assignment_id, category.term_id, id]
        );

        if (Number(total.total) + weight > 100) {
            return res.status(400).json({ error: 'La suma de categorias del parcial no puede pasar de 100%' });
        }

        await connection.query(
            'UPDATE evaluation_categories SET name = ?, weight_percentage = ? WHERE id = ?',
            [name.trim(), weight, id]
        );

        res.json({ message: 'Categoria actualizada con exito' });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe una categoria con ese nombre' });
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    let connection;
    try {
        const id = parseId(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID invalido' });

        connection = await pool.getConnection();
        const [result] = await connection.query('DELETE FROM evaluation_categories WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Categoria no encontrada' });
        }

        res.json({ message: 'Categoria eliminada con exito' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/categories/clone', async (req, res) => {
    let connection;
    try {
        const { source_assignment_id, source_term_id, target_assignment_id, target_term_id } = req.body;
        const srcAssignId = parseId(source_assignment_id);
        const srcTermId = parseId(source_term_id);
        const tgtAssignId = parseId(target_assignment_id);
        const tgtTermId = parseId(target_term_id);

        if (!srcAssignId || !srcTermId || !tgtAssignId || !tgtTermId) {
            return res.status(400).json({ error: 'Grupo origen, parcial origen, grupo destino y parcial destino son obligatorios' });
        }
        if (srcAssignId === tgtAssignId && srcTermId === tgtTermId) {
            return res.status(400).json({ error: 'El origen y el destino no pueden ser iguales' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [srcCategories] = await connection.query(
            'SELECT id, name, weight_percentage FROM evaluation_categories WHERE assignment_id = ? AND term_id = ?',
            [srcAssignId, srcTermId]
        );

        if (srcCategories.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'El grupo origen seleccionado no tiene categorias para copiar' });
        }

        await connection.query(
            'DELETE FROM evaluation_categories WHERE assignment_id = ? AND term_id = ?',
            [tgtAssignId, tgtTermId]
        );

        for (const category of srcCategories) {
            const [catResult] = await connection.query(
                'INSERT INTO evaluation_categories (assignment_id, term_id, name, weight_percentage) VALUES (?, ?, ?, ?)',
                [tgtAssignId, tgtTermId, category.name, category.weight_percentage]
            );
            const newCategoryId = catResult.insertId;

            const [srcEvaluations] = await connection.query(
                'SELECT name, status FROM evaluations WHERE category_id = ?',
                [category.id]
            );

            for (const evaluation of srcEvaluations) {
                await connection.query(
                    'INSERT INTO evaluations (category_id, name, status) VALUES (?, ?, ?)',
                    [newCategoryId, evaluation.name, evaluation.status]
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Estructura copiada con exito' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/evaluations', async (req, res) => {
    let connection;
    try {
        const assignmentId = parseId(req.query.assignment_id);
        const termId = parseId(req.query.term_id);
        const categoryId = parseId(req.query.category_id);

        connection = await pool.getConnection();
        let where = 'WHERE 1 = 1';
        const params = [];

        if (categoryId) {
            where += ' AND e.category_id = ?';
            params.push(categoryId);
        }
        if (assignmentId) {
            where += ' AND ec.assignment_id = ?';
            params.push(assignmentId);
        }
        if (termId) {
            where += ' AND ec.term_id = ?';
            params.push(termId);
        }

        const [rows] = await connection.query(`
            SELECT
                e.*,
                ec.name AS category_name,
                ec.weight_percentage,
                ec.term_id,
                ec.assignment_id
            FROM evaluations e
            JOIN evaluation_categories ec ON e.category_id = ec.id
            ${where}
            ORDER BY ec.name ASC, e.name ASC
        `, params);

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/evaluations', async (req, res) => {
    let connection;
    try {
        const { category_id, name } = req.body;
        const categoryId = parseId(category_id);
        if (!categoryId || !requiredText(name)) {
            return res.status(400).json({ error: 'Categoria y nombre de evaluacion son obligatorios' });
        }

        connection = await pool.getConnection();
        const [result] = await connection.query(
            'INSERT INTO evaluations (category_id, name) VALUES (?, ?)',
            [categoryId, name.trim()]
        );

        res.status(201).json({ id: result.insertId, message: 'Evaluacion creada' });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ya existe una evaluacion con ese nombre en la categoria' });
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/gradebook', async (req, res) => {
    let connection;
    try {
        const assignmentId = parseId(req.query.assignment_id);
        const termId = parseId(req.query.term_id);
        if (!assignmentId || !termId) {
            return res.status(400).json({ error: 'Selecciona grupo-materia y parcial' });
        }

        connection = await pool.getConnection();
        const [[context]] = await connection.query(`
            SELECT
                gsa.id AS assignment_id,
                g.id AS group_id,
                g.code AS group_code,
                g.name AS group_name,
                s.name AS subject_name,
                s.passing_score,
                c.name AS career_name,
                ca.name AS campus_name,
                t.name AS term_name,
                t.percentage AS term_percentage
            FROM group_subject_assignments gsa
            JOIN academic_groups g ON gsa.group_id = g.id
            JOIN subjects s ON gsa.subject_id = s.id
            JOIN careers c ON g.career_id = c.id
            JOIN campuses ca ON g.campus_id = ca.id
            JOIN terms t ON t.career_id = c.id
            WHERE gsa.id = ? AND t.id = ?
            LIMIT 1
        `, [assignmentId, termId]);

        if (!context) return res.status(404).json({ error: 'Asignacion o parcial no encontrado' });

        const [students] = await connection.query(`
            SELECT s.id, CONCAT(s.first_name, ' ', s.last_name) AS full_name
            FROM enrollments e
            JOIN students s ON e.student_id = s.id
            WHERE e.group_id = ? AND e.status = 'activo'
            ORDER BY s.last_name ASC, s.first_name ASC
        `, [context.group_id]);

        const [evaluations] = await connection.query(`
            SELECT
                e.id AS evaluation_id,
                e.name AS evaluation_name,
                ec.id AS category_id,
                ec.name AS category_name,
                ec.weight_percentage
            FROM evaluations e
            JOIN evaluation_categories ec ON e.category_id = ec.id
            WHERE ec.assignment_id = ? AND ec.term_id = ?
            ORDER BY ec.name ASC, e.name ASC
        `, [assignmentId, termId]);

        const [grades] = await connection.query(`
            SELECT g.student_id, g.evaluation_id, g.score
            FROM grades g
            JOIN evaluations e ON g.evaluation_id = e.id
            JOIN evaluation_categories ec ON e.category_id = ec.id
            WHERE ec.assignment_id = ? AND ec.term_id = ?
        `, [assignmentId, termId]);

        res.json({ context, students, evaluations, grades });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/grades', async (req, res) => {
    let connection;
    try {
        const { student_id, evaluation_id, score } = req.body;
        const studentId = parseId(student_id);
        const evaluationId = parseId(evaluation_id);
        const parsedScore = Number.parseFloat(score);

        if (!studentId || !evaluationId || !Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100) {
            return res.status(400).json({ error: 'La nota debe estar entre 0 y 100' });
        }

        connection = await pool.getConnection();
        await connection.query(`
            INSERT INTO grades (student_id, evaluation_id, score)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE score = VALUES(score)
        `, [studentId, evaluationId, parsedScore]);

        res.json({ success: true, message: 'Nota guardada' });
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
        const { campus_id, career_id, group_id, status } = req.query;
        const conditions = [];
        const params = [];

        if (parseId(campus_id)) {
            conditions.push('g.campus_id = ?');
            params.push(parseId(campus_id));
        }
        if (parseId(career_id)) {
            conditions.push('e.career_id = ?');
            params.push(parseId(career_id));
        }
        if (parseId(group_id)) {
            conditions.push('e.group_id = ?');
            params.push(parseId(group_id));
        }
        if (status && status !== 'todos') {
            conditions.push('s.status = ?');
            params.push(status);
        }

        const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

        connection = await pool.getConnection();
        const [rows] = await connection.query(`
            SELECT
                s.*,
                CONCAT(s.first_name, ' ', s.last_name) AS full_name,
                g.id AS group_id,
                g.code AS group_code,
                g.name AS group_name,
                c.id AS career_id,
                c.name AS career_name,
                ca.id AS campus_id,
                ca.name AS campus_name
            FROM students s
            LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'activo'
            LEFT JOIN academic_groups g ON e.group_id = g.id
            LEFT JOIN careers c ON e.career_id = c.id
            LEFT JOIN campuses ca ON g.campus_id = ca.id
            WHERE 1=1 ${whereClause}
            ORDER BY s.last_name ASC, s.first_name ASC
        `, params);
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

app.put('/api/students/:id', async (req, res) => {
    let connection;
    try {
        const id = parseId(req.params.id);
        const { first_name, last_name, phone, notes } = req.body;
        if (!id) return res.status(400).json({ error: 'ID invalido' });
        if (!requiredText(first_name) || !requiredText(last_name)) {
            return res.status(400).json({ error: 'Nombre y apellido son obligatorios' });
        }

        connection = await pool.getConnection();
        const [result] = await connection.query(
            'UPDATE students SET first_name = ?, last_name = ?, phone = ?, notes = ? WHERE id = ?',
            [first_name.trim(), last_name.trim(), phone || null, notes || null, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Estudiante no encontrado' });
        res.json({ message: 'Datos del estudiante actualizados' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.put('/api/students/:id/status', async (req, res) => {
    let connection;
    try {
        const id = parseId(req.params.id);
        const { status } = req.body;
        const validStatuses = ['activo', 'retirado', 'abandono', 'egresado', 'reprobo'];
        if (!id) return res.status(400).json({ error: 'ID invalido' });
        if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Estado invalido' });

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query(
            'UPDATE students SET status = ? WHERE id = ?',
            [status, id]
        );
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        // Sincronizar el estado de sus inscripciones activas si se da de baja
        if (status !== 'activo') {
            await connection.query(
                "UPDATE enrollments SET status = ? WHERE student_id = ? AND status = 'activo'",
                [status, id]
            );
        } else {
            // Al reactivar: poner sus inscripciones como activo
            await connection.query(
                "UPDATE enrollments SET status = 'activo' WHERE student_id = ?",
                [id]
            );
        }

        await connection.commit();
        res.json({ message: `Estado del estudiante actualizado a "${status}"` });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/students/:id/transfer', async (req, res) => {
    let connection;
    try {
        const studentId = parseId(req.params.id);
        const newGroupId = parseId(req.body.group_id);
        if (!studentId || !newGroupId) return res.status(400).json({ error: 'Estudiante y grupo de destino son obligatorios' });

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Verificar que el estudiante existe
        const [[student]] = await connection.query('SELECT id, status FROM students WHERE id = ? LIMIT 1', [studentId]);
        if (!student) {
            await connection.rollback();
            return res.status(404).json({ error: 'Estudiante no encontrado' });
        }

        // Verificar que el grupo destino existe
        const [[newGroup]] = await connection.query(
            'SELECT id, career_id, academic_year_id FROM academic_groups WHERE id = ? AND status = "activo" LIMIT 1',
            [newGroupId]
        );
        if (!newGroup) {
            await connection.rollback();
            return res.status(404).json({ error: 'Grupo de destino no encontrado o no esta activo' });
        }

        // Verificar que no esta ya inscrito en ese grupo
        const [[existing]] = await connection.query(
            'SELECT id FROM enrollments WHERE student_id = ? AND group_id = ? LIMIT 1',
            [studentId, newGroupId]
        );
        if (existing) {
            await connection.rollback();
            return res.status(400).json({ error: 'El estudiante ya esta inscrito en ese grupo' });
        }

        // Desactivar inscripciones anteriores activas
        await connection.query(
            "UPDATE enrollments SET status = 'retirado' WHERE student_id = ? AND status = 'activo'",
            [studentId]
        );

        // Crear nueva inscripcion
        await connection.query(
            'INSERT INTO enrollments (student_id, group_id, career_id, academic_year_id, status) VALUES (?, ?, ?, ?, ?)',
            [studentId, newGroupId, newGroup.career_id, newGroup.academic_year_id, 'activo']
        );

        await connection.commit();
        res.json({ message: 'Estudiante transferido al nuevo grupo correctamente' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/students/:id/kardex', async (req, res) => {
    let connection;
    try {
        const studentId = parseId(req.params.id);
        if (!studentId) return res.status(400).json({ error: 'ID de estudiante no valido' });

        connection = await pool.getConnection();

        // 1. Obtener datos basicos del estudiante
        const [[student]] = await connection.query(
            'SELECT id, first_name, last_name, phone, notes, status, CONCAT(first_name, " ", last_name) AS full_name FROM students WHERE id = ? LIMIT 1',
            [studentId]
        );
        if (!student) return res.status(404).json({ error: 'Estudiante no encontrado' });

        // 2. Obtener las inscripciones del estudiante
        const [enrollments] = await connection.query(`
            SELECT 
                e.id AS enrollment_id, 
                e.group_id, 
                e.career_id, 
                c.name AS career_name, 
                ca.name AS campus_name, 
                ay.name AS academic_year_name, 
                g.code AS group_code,
                e.status AS enrollment_status
            FROM enrollments e
            JOIN academic_groups g ON e.group_id = g.id
            JOIN careers c ON e.career_id = c.id
            JOIN campuses ca ON g.campus_id = ca.id
            JOIN academic_years ay ON e.academic_year_id = ay.id
            WHERE e.student_id = ?
        `, [studentId]);

        if (enrollments.length === 0) {
            return res.json({ student, enrollments: [] });
        }

        const groupIds = enrollments.map(e => e.group_id);
        const careerIds = enrollments.map(e => e.career_id);

        // 3. Obtener parciales de las carreras implicadas
        const [terms] = await connection.query(`
            SELECT id AS term_id, career_id, name AS term_name, percentage AS term_percentage, term_order
            FROM terms
            WHERE career_id IN (?)
            ORDER BY term_order ASC
        `, [careerIds]);

        // 4. Obtener materias asignadas a los grupos
        const [assignments] = await connection.query(`
            SELECT 
                gsa.id AS assignment_id, 
                gsa.group_id,
                s.id AS subject_id, 
                s.name AS subject_name, 
                s.code AS subject_code, 
                s.passing_score,
                s.grade_number
            FROM group_subject_assignments gsa
            JOIN subjects s ON gsa.subject_id = s.id
            WHERE gsa.group_id IN (?)
        `, [groupIds]);

        if (assignments.length === 0) {
            return res.json({
                student,
                enrollments: enrollments.map(e => ({
                    ...e,
                    terms: terms.filter(t => t.career_id === e.career_id),
                    subjects: []
                }))
            });
        }

        const assignmentIds = assignments.map(a => a.assignment_id);

        // 5. Obtener todas las categorias de las materias asignadas
        const [categories] = await connection.query(`
            SELECT id AS category_id, assignment_id, term_id, name AS category_name, weight_percentage
            FROM evaluation_categories
            WHERE assignment_id IN (?)
        `, [assignmentIds]);

        const categoryIds = categories.map(c => c.category_id);

        let evaluations = [];
        let grades = [];

        if (categoryIds.length > 0) {
            // 6. Obtener todas las evaluaciones para estas categorias
            const [evalRows] = await connection.query(`
                SELECT id AS evaluation_id, category_id, name AS evaluation_name
                FROM evaluations
                WHERE category_id IN (?)
            `, [categoryIds]);
            evaluations = evalRows;

            const evaluationIds = evaluations.map(ev => ev.evaluation_id);

            if (evaluationIds.length > 0) {
                // 7. Obtener todas las calificaciones del estudiante para estas evaluaciones
                const [gradeRows] = await connection.query(`
                    SELECT evaluation_id, score
                    FROM grades
                    WHERE student_id = ? AND evaluation_id IN (?)
                `, [studentId, evaluationIds]);
                grades = gradeRows;
            }
        }

        // Crear mapas para busquedas rapidas O(1)
        const gradesMap = new Map(grades.map(g => [g.evaluation_id, Number(g.score)]));

        // Mapear evaluaciones por categoria
        const evalsByCategory = new Map();
        evaluations.forEach(ev => {
            if (!evalsByCategory.has(ev.category_id)) {
                evalsByCategory.set(ev.category_id, []);
            }
            evalsByCategory.get(ev.category_id).push(ev);
        });

        // Mapear categorias por asignacion y parcial
        const categoriesByAssignAndTerm = new Map();
        categories.forEach(cat => {
            const key = `${cat.assignment_id}_${cat.term_id}`;
            if (!categoriesByAssignAndTerm.has(key)) {
                categoriesByAssignAndTerm.set(key, []);
            }
            categoriesByAssignAndTerm.get(key).push(cat);
        });

        // Agrupar resultados por inscripcion
        const resultEnrollments = enrollments.map(enrollment => {
            const enrollmentTerms = terms.filter(t => t.career_id === enrollment.career_id);
            const enrollmentAssignments = assignments.filter(a => a.group_id === enrollment.group_id);

            const subjectList = enrollmentAssignments.map(subject => {
                const termGrades = {};
                let hasIncompleteTerms = false;

                enrollmentTerms.forEach(term => {
                    const key = `${subject.assignment_id}_${term.term_id}`;
                    const termCats = categoriesByAssignAndTerm.get(key) || [];

                    if (termCats.length === 0) {
                        termGrades[term.term_id] = 0;
                        hasIncompleteTerms = true;
                        return;
                    }

                    let termInternalScore = 0;

                    termCats.forEach(category => {
                        const catEvals = evalsByCategory.get(category.category_id) || [];

                        if (catEvals.length === 0) {
                            // Categoria vacia, aporta 0
                            hasIncompleteTerms = true;
                            return;
                        }

                        let categoryGradesSum = 0;
                        catEvals.forEach(ev => {
                            categoryGradesSum += gradesMap.get(ev.evaluation_id) || 0;
                        });

                        const categoryAverage = categoryGradesSum / catEvals.length;
                        termInternalScore += categoryAverage * (Number(category.weight_percentage) / 100);
                    });

                    const termOfficialScore = termInternalScore * (Number(term.term_percentage) / 100);
                    termGrades[term.term_id] = Number(termOfficialScore.toFixed(2));
                });

                // Calcular nota final (suma de las notas oficiales de todos los parciales)
                const finalScore = Object.values(termGrades).reduce((sum, score) => sum + score, 0);

                // Determinar el estado de la materia
                let subjectStatus = 'Reprobado';
                if (finalScore >= Number(subject.passing_score)) {
                    subjectStatus = 'Aprobado';
                } else if (hasIncompleteTerms && enrollment.enrollment_status === 'activo') {
                    subjectStatus = 'Cursando';
                }

                return {
                    subject_id: subject.subject_id,
                    name: subject.subject_name,
                    code: subject.subject_code,
                    grade_number: subject.grade_number,
                    passing_score: Number(subject.passing_score),
                    term_grades: termGrades,
                    final_score: Number(finalScore.toFixed(2)),
                    status: subjectStatus
                };
            });

            return {
                enrollment_id: enrollment.enrollment_id,
                group_code: enrollment.group_code,
                career_name: enrollment.career_name,
                campus_name: enrollment.campus_name,
                academic_year: enrollment.academic_year_name,
                enrollment_status: enrollment.enrollment_status,
                terms: enrollmentTerms.map(t => ({
                    term_id: t.term_id,
                    name: t.term_name,
                    percentage: Number(t.term_percentage),
                    term_order: t.term_order
                })),
                subjects: subjectList
            };
        });

        res.json({
            student,
            enrollments: resultEnrollments
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

async function startServer() {
    const maxAttempts = 20;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await initializeDatabase();
            const PORT = process.env.PORT || 3000;
            app.listen(PORT, () => {
                console.log(`Sistema de Calificaciones V3 corriendo en puerto ${PORT}`);
            });
            return;
        } catch (error) {
            console.error(`No se pudo inicializar la base de datos V3. Intento ${attempt}/${maxAttempts}:`, error.message);
            if (attempt === maxAttempts) {
                process.exit(1);
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }
}

startServer();
