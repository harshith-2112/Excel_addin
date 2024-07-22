const express = require('express');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { expressjwt: expressJwt } = require('express-jwt');

const app = express();

app.use(cors({
  origin: 'https://localhost:3000',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  allowedHeaders: 'Content-Type, Authorization'
}));
app.use(bodyParser.json({ limit: '50mb' }));

const secret = process.env.SECRET_KEY || 'Bluekaktus';

const USERS = [
  { username: 'admin', password: bcrypt.hashSync('adminpassword', 8), role: 'admin' },
  { username: 'client', password: bcrypt.hashSync('clientpassword', 8), role: 'client' }
];

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Youneverknow@21',
  database: 'webs',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const jwtMiddleware = expressJwt({
  secret: secret,
  algorithms: ['HS256'],
  credentialsRequired: false,
  getToken: req => req.headers.authorization?.split(' ')[1] || req.query?.token
}).unless({ path: ['/login'] });

app.use(jwtMiddleware);

app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    res.status(401).send('Invalid token or no token provided');
  } else {
    next(err);
  }
});

function formatDateForMySQL(dateTime) {
    if (!dateTime) return null;
    const date = new Date(dateTime);
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
}

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).send('Invalid credentials');
  }
  const token = jwt.sign({ username: user.username, role: user.role }, secret, { expiresIn: '1h' });
  res.send({ token });
});

app.get('/api/students', async (req, res) => {
  try {
    const [results] = await pool.query('SELECT * FROM student');
    res.json(results);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).send('Server error');
  }
});

app.post('/api/students/changes', async (req, res) => {
    const { insert, update, delete: deleteItems } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        for (const student of insert) {
            student.uploaded_time = formatDateForMySQL(student.uploaded_time);
            const query = 'INSERT INTO student (id, name, class, marks, uploaded_time) VALUES (?, ?, ?, ?, ?)';
            await connection.query(query, [student.id, student.name, student.class, student.marks, student.uploaded_time]);
        }

        for (const student of update) {
            student.uploaded_time = formatDateForMySQL(student.uploaded_time);
            const query = 'UPDATE student SET name = ?, class = ?, marks = ?, uploaded_time = ? WHERE id = ?';
            await connection.query(query, [student.name, student.class, student.marks, student.uploaded_time, student.id]);
        }

        for (const student of deleteItems) {
            const query = 'DELETE FROM student WHERE id = ?';
            await connection.query(query, [student.id]);
        }

        await connection.commit();
        res.status(200).send('Changes processed successfully');
    } catch (err) {
        await connection.rollback();
        console.error('Failed to process changes:', err);
        res.status(500).send('Failed to process changes');
    } finally {
        connection.release();
    }
});

const options = {
  key: fs.readFileSync('localhost-key.pem'),
  cert: fs.readFileSync('localhost.pem')
};

const port = 3001;
https.createServer(options, app).listen(port, () => {
  console.log(`HTTPS Server is running on https://localhost:${port}`);
});
