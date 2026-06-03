const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'db',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'calificaciones_v3_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function seedIfMissing(connection, table, uniqueColumn, uniqueValue, insertSql, values) {
    const [rows] = await connection.query(`SELECT id FROM ${table} WHERE ${uniqueColumn} = ? LIMIT 1`, [uniqueValue]);
    if (rows.length > 0) return rows[0].id;

    const [result] = await connection.query(insertSql, values);
    return result.insertId;
}

async function initializeDatabase() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('Inicializando base de datos V3...');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('superadministrador', 'docente') NOT NULL DEFAULT 'docente',
                status ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS campuses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                address VARCHAR(255) NULL,
                status ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS careers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(50) NULL,
                faculty VARCHAR(255) NULL,
                academic_type ENUM('anual', 'semestral', 'modular') NOT NULL,
                duration INT NOT NULL DEFAULT 1,
                status ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS career_campuses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                career_id INT NOT NULL,
                campus_id INT NOT NULL,
                UNIQUE KEY uq_career_campus (career_id, campus_id),
                FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE,
                FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS academic_years (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                year_number INT NOT NULL,
                status ENUM('activo', 'cerrado') NOT NULL DEFAULT 'activo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS academic_periods (
                id INT AUTO_INCREMENT PRIMARY KEY,
                academic_year_id INT NOT NULL,
                name VARCHAR(100) NOT NULL,
                start_date DATE NULL,
                end_date DATE NULL,
                status ENUM('activo', 'cerrado') NOT NULL DEFAULT 'activo',
                UNIQUE KEY uq_year_period (academic_year_id, name),
                FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS subjects (
                id INT AUTO_INCREMENT PRIMARY KEY,
                career_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                code VARCHAR(50) NULL,
                description TEXT NULL,
                passing_score DECIMAL(5,2) NOT NULL DEFAULT 61.00,
                grade_number INT NOT NULL,
                status ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
                UNIQUE KEY uq_subject_career_grade_name (career_id, grade_number, name),
                FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS academic_groups (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                career_id INT NOT NULL,
                campus_id INT NOT NULL,
                academic_year_id INT NOT NULL,
                academic_period_id INT NULL,
                grade_number INT NOT NULL,
                shift ENUM('maniana', 'tarde', 'noche') NOT NULL,
                class_modality ENUM('presencial', 'virtual', 'semipresencial') NOT NULL,
                status ENUM('activo', 'inactivo', 'cerrado') NOT NULL DEFAULT 'activo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE RESTRICT,
                FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE RESTRICT,
                FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
                FOREIGN KEY (academic_period_id) REFERENCES academic_periods(id) ON DELETE SET NULL
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS group_subject_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                group_id INT NOT NULL,
                subject_id INT NOT NULL,
                teacher_id INT NULL,
                status ENUM('activo', 'inactivo', 'cerrado') NOT NULL DEFAULT 'activo',
                UNIQUE KEY uq_group_subject (group_id, subject_id),
                FOREIGN KEY (group_id) REFERENCES academic_groups(id) ON DELETE CASCADE,
                FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
                FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS students (
                id INT AUTO_INCREMENT PRIMARY KEY,
                first_name VARCHAR(150) NOT NULL,
                last_name VARCHAR(150) NOT NULL,
                phone VARCHAR(50) NULL,
                notes TEXT NULL,
                status ENUM('activo', 'retirado', 'abandono', 'egresado', 'reprobo') NOT NULL DEFAULT 'activo',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS enrollments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                group_id INT NOT NULL,
                career_id INT NOT NULL,
                academic_year_id INT NOT NULL,
                status ENUM('activo', 'retirado', 'abandono', 'egresado', 'reprobo') NOT NULL DEFAULT 'activo',
                enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_student_group (student_id, group_id),
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (group_id) REFERENCES academic_groups(id) ON DELETE CASCADE,
                FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE RESTRICT,
                FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS terms (
                id INT AUTO_INCREMENT PRIMARY KEY,
                career_id INT NOT NULL,
                name VARCHAR(100) NOT NULL,
                percentage DECIMAL(5,2) NOT NULL,
                term_order INT NOT NULL DEFAULT 1,
                status ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
                UNIQUE KEY uq_career_term_name (career_id, name),
                FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS evaluation_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                assignment_id INT NOT NULL,
                term_id INT NOT NULL,
                name VARCHAR(150) NOT NULL,
                weight_percentage DECIMAL(5,2) NOT NULL,
                is_closed BOOLEAN NOT NULL DEFAULT FALSE,
                UNIQUE KEY uq_assignment_term_category (assignment_id, term_id, name),
                FOREIGN KEY (assignment_id) REFERENCES group_subject_assignments(id) ON DELETE CASCADE,
                FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS evaluations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category_id INT NOT NULL,
                name VARCHAR(150) NOT NULL,
                status ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo',
                UNIQUE KEY uq_category_evaluation (category_id, name),
                FOREIGN KEY (category_id) REFERENCES evaluation_categories(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS grades (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                evaluation_id INT NOT NULL,
                score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_student_evaluation (student_id, evaluation_id),
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
            )
        `);

        await seedIfMissing(
            connection,
            'users',
            'username',
            'admin',
            'INSERT INTO users (full_name, username, password, role) VALUES (?, ?, ?, ?)',
            ['Super Administrador', 'admin', '1234', 'superadministrador']
        );

        await seedIfMissing(
            connection,
            'users',
            'username',
            'docente',
            'INSERT INTO users (full_name, username, password, role) VALUES (?, ?, ?, ?)',
            ['Docente Principal', 'docente', '1234', 'docente']
        );

        const altoId = await seedIfMissing(connection, 'campuses', 'name', 'Sede El Alto', 'INSERT INTO campuses (name) VALUES (?)', ['Sede El Alto']);
        const mirafloresId = await seedIfMissing(connection, 'campuses', 'name', 'Sede Miraflores', 'INSERT INTO campuses (name) VALUES (?)', ['Sede Miraflores']);
        await seedIfMissing(connection, 'campuses', 'name', 'Sede Ballivian', 'INSERT INTO campuses (name) VALUES (?)', ['Sede Ballivian']);

        const careerId = await seedIfMissing(
            connection,
            'careers',
            'name',
            'Sistemas Informaticos',
            'INSERT INTO careers (name, code, faculty, academic_type, duration) VALUES (?, ?, ?, ?, ?)',
            ['Sistemas Informaticos', 'SIS', 'Tecnologia', 'anual', 3]
        );

        await connection.query('INSERT IGNORE INTO career_campuses (career_id, campus_id) VALUES (?, ?), (?, ?)', [
            careerId,
            altoId,
            careerId,
            mirafloresId
        ]);

        await connection.query(`
            INSERT INTO subjects (career_id, name, code, description, passing_score, grade_number)
            SELECT ?, 'Taller de Sistemas Operativos', 'TSO-1', 'Materia base de sistemas operativos', 61, 1
            WHERE NOT EXISTS (
                SELECT 1 FROM subjects WHERE career_id = ? AND name = 'Taller de Sistemas Operativos'
            )
        `, [careerId, careerId]);

        const yearId = await seedIfMissing(
            connection,
            'academic_years',
            'name',
            'Gestion 2026',
            'INSERT INTO academic_years (name, year_number) VALUES (?, ?)',
            ['Gestion 2026', 2026]
        );

        await connection.query(`
            INSERT INTO academic_periods (academic_year_id, name, start_date, end_date)
            SELECT ?, 'Periodo I', '2026-01-01', '2026-06-30'
            WHERE NOT EXISTS (
                SELECT 1 FROM academic_periods WHERE academic_year_id = ? AND name = 'Periodo I'
            )
        `, [yearId, yearId]);

        for (const [index, name] of ['1er Parcial', '2do Parcial', '3er Parcial', '4to Parcial'].entries()) {
            await connection.query(`
                INSERT INTO terms (career_id, name, percentage, term_order)
                SELECT ?, ?, 25.00, ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM terms WHERE career_id = ? AND name = ?
                )
            `, [careerId, name, index + 1, careerId, name]);
        }

        console.log('Base de datos V3 lista.');
    } catch (error) {
        console.error('Error inicializando base de datos V3:', error);
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = {
    pool,
    initializeDatabase
};
