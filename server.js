require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Basic Auth ────────────────────────────────────────────────
const AUTH_USER = process.env.AUTH_USER || 'rain';
const AUTH_PASS = process.env.AUTH_PASS || 'refurb';

app.use((req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Basic ')) {
    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    if (user === AUTH_USER && pass === AUTH_PASS) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="rain Refurb Flow"');
  res.status(401).send('Authentication required');
});

app.use(express.static(path.join(__dirname, 'public')));

// ── DB connection pool - support URL or individual vars ───────
const poolConfig = process.env.MYSQL_URL
  ? { uri: process.env.MYSQL_URL, waitForConnections: true, connectionLimit: 10 }
  : {
      host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306'),
      user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
      password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'refurb_flow',
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 20000,
    };

const pool = mysql.createPool(poolConfig);

// ── Init DB ───────────────────────────────────────────────────
async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS models (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS stages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        model_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        time_minutes INT DEFAULT 10,
        sort_order INT DEFAULT 0,
        status ENUM('pending','approved','declined') DEFAULT 'pending',
        notes TEXT,
        FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
      )
    `);

    // Seed only if models table is empty
    const [[{ cnt }]] = await conn.query('SELECT COUNT(*) as cnt FROM models');
    if (cnt === 0) {
      await conn.query(`INSERT INTO models (slug, name) VALUES ('loop', 'The Loop'), ('101', 'The 101')`);

      const [[loopModel]] = await conn.query("SELECT id FROM models WHERE slug='loop'");
      const [[model101]] = await conn.query("SELECT id FROM models WHERE slug='101'");

      const defaultStages = [
        { name: 'Inspection',       time_minutes: 10, sort_order: 0 },
        { name: 'Grading',          time_minutes: 5,  sort_order: 1 },
        { name: 'Cleaning',         time_minutes: 15, sort_order: 2 },
        { name: 'Firmware Update',  time_minutes: 20, sort_order: 3 },
        { name: 'Testing',          time_minutes: 30, sort_order: 4 },
        { name: 'Labeling',         time_minutes: 5,  sort_order: 5 },
        { name: 'Packaging',        time_minutes: 10, sort_order: 6 },
      ];

      for (const modelId of [loopModel.id, model101.id]) {
        for (const stage of defaultStages) {
          await conn.query(
            `INSERT INTO stages (model_id, name, time_minutes, sort_order, status, notes)
             VALUES (?, ?, ?, ?, 'pending', '')`,
            [modelId, stage.name, stage.time_minutes, stage.sort_order]
          );
        }
      }
    }

    console.log('Database initialized');
  } finally {
    conn.release();
  }
}

// ── Models ───────────────────────────────────────────────────
app.get('/api/models', async (req, res) => {
  try {
    const [models] = await pool.query('SELECT * FROM models ORDER BY id');
    for (const m of models) {
      const [[stats]] = await pool.query(
        `SELECT COUNT(*) as stage_count,
                SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved_count,
                COALESCE(SUM(time_minutes), 0) as total_minutes
         FROM stages WHERE model_id = ?`,
        [m.id]
      );
      m.stage_count = stats.stage_count;
      m.approved_count = stats.approved_count || 0;
      m.total_minutes = stats.total_minutes || 0;
    }
    res.json(models);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stages ───────────────────────────────────────────────────
app.get('/api/models/:id/stages', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM stages WHERE model_id = ? ORDER BY sort_order ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/models/:id/stages', async (req, res) => {
  try {
    const { name = 'New Stage', time_minutes = 10 } = req.body;
    const modelId = req.params.id;

    const [[{ maxOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) as maxOrder FROM stages WHERE model_id = ?',
      [modelId]
    );
    const sort_order = maxOrder + 1;

    const [result] = await pool.query(
      `INSERT INTO stages (model_id, name, time_minutes, sort_order, status, notes)
       VALUES (?, ?, ?, ?, 'pending', '')`,
      [modelId, name, time_minutes, sort_order]
    );

    const [[newStage]] = await pool.query('SELECT * FROM stages WHERE id = ?', [result.insertId]);
    res.json(newStage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stages/:id', async (req, res) => {
  try {
    const { name, time_minutes, status, notes } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined)         { updates.push('name = ?');         params.push(name); }
    if (time_minutes !== undefined) { updates.push('time_minutes = ?'); params.push(time_minutes); }
    if (status !== undefined)       { updates.push('status = ?');       params.push(status); }
    if (notes !== undefined)        { updates.push('notes = ?');        params.push(notes); }

    if (updates.length === 0) return res.json({ success: true });

    params.push(req.params.id);
    await pool.query(`UPDATE stages SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/stages/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM stages WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/models/:id/reset', async (req, res) => {
  try {
    await pool.query(
      "UPDATE stages SET status = 'pending', notes = '' WHERE model_id = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stages/:id/reorder', async (req, res) => {
  try {
    const { stages } = req.body; // [{id, sort_order}, ...]
    if (!Array.isArray(stages)) return res.status(400).json({ error: 'stages array required' });

    for (const s of stages) {
      await pool.query('UPDATE stages SET sort_order = ? WHERE id = ?', [s.sort_order, s.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────
async function startWithRetry(attempts = 10, delay = 5000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await initDB();
      app.listen(PORT, () => console.log(`rain Refurb Flow running on port ${PORT}`));
      return;
    } catch (err) {
      console.error(`DB init attempt ${i}/${attempts} failed:`, err.message);
      if (i < attempts) {
        console.log(`Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error('All DB init attempts failed. Exiting.');
        process.exit(1);
      }
    }
  }
}

startWithRetry();
