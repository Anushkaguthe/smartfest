

const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

app.use(session({
    secret: 'fest_secret_key',
    resave: false,
    saveUninitialized: false
}));

// MySQL connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',          // your MySQL username
    password: 'anushka@124', // your MySQL password
    database: 'FEST'
});

db.connect(err => {
    if(err) throw err;
    console.log('Connected to MySQL DB!');
});
const PORT = 3000;
app.get('/register', (req, res) => {
    res.render('register', { error: '' });
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
app.post('/register', (req, res) => {
    const { username, fullname, contact, email, password } = req.body;

    db.query(
        'SELECT * FROM user_account WHERE username = ? OR user_email = ?',
        [username, email],
        (err, results) => {
            if (err) throw err;
            if (results.length > 0) {
                return res.render('register', { error: 'Username or Email already exists' });
            }

            const hashedPassword = bcrypt.hashSync(password, 10);

            db.query(
                'INSERT INTO user_account (username, fullname, contact_num, user_email, status, password_hash) VALUES (?, ?, ?, ?, "Active", ?)',
                [username, fullname, contact, email, hashedPassword],
                (err) => {
                    if (err) throw err;
                    res.redirect('/login');
                }
            );
        }
    );
});


app.get('/login', (req, res) => {
    res.render('login', { error: '' });
});

// POST /login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // 1️⃣ Check user credentials
    db.query('SELECT * FROM user_account WHERE username = ?', [username], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.render('login', { error: 'Invalid credentials' });
        }

        const user = results[0];

        // 2️⃣ Check password
        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.render('login', { error: 'Invalid credentials' });
        }

        // 3️⃣ Fetch roles from DB
        db.query(
            `SELECT r.role_name FROM user_role ur
             JOIN roles r ON ur.role_id = r.role_id
             WHERE ur.user_id = ?`,
            [user.user_id],
            (err, roleResults) => {
                if (err) throw err;

                const roles = roleResults.map(r => r.role_name); // Array of role names
                req.session.userId = user.user_id;
                req.session.username = user.username;
                req.session.roles = roles;

                // 4️⃣ Redirect based on role
                if (roles.includes('Admin')) {
                    return res.redirect('/dashboard/admin');
                } else if (roles.includes('Staff')) {
                    return res.redirect('/dashboard/staff');
                } else if (roles.includes('Judge')) {
                    return res.redirect('/dashboard/judge');
                } else {
                    return res.redirect('/dashboard/participant'); // default
                }
            }
        );
    });
});

// Admin dashboard
app.get('/dashboard/admin', (req, res) => {
    if (!req.session.userId || !req.session.roles.includes('Admin')) {
        return res.status(403).send('Access denied');
    }
    res.render('dashboard_admin', { username: req.session.username });
});

// participant dashboard
app.get('/dashboard/participant', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    const user_id = req.session.userId;

    // Step 1: Get participant ID
    db.query('SELECT student_id FROM participant WHERE user_id = ?', [user_id], (err, participantResult) => {
        if (err) throw err;

        let student_id = null;
        if (participantResult.length > 0) {
            student_id = participantResult[0].student_id;
        }

        // Step 2: Fetch all events
        db.query('SELECT * FROM event_s ORDER BY event_date ASC', (err, events) => {
            if (err) throw err;

            if (!student_id) {
                // If participant row not created yet
                return res.render('dashboard_participant', {
                    username: req.session.username,
                    events,
                    registeredEventIds: [] // no registered events
                });
            }

            // Step 3: Fetch registered events
            db.query('SELECT event_id FROM participant_event WHERE student_id = ?', [student_id], (err, registeredEvents) => {
                if (err) throw err;

                const registeredEventIds = registeredEvents.map(e => e.event_id);
            db.query('SELECT pt.token_id, t.token_type, pt.stats FROM participant_token pt JOIN token t ON pt.token_id=t.token_id WHERE pt.student_id=?', [student_id], (err, tokens) => {
                if (err) throw err;
   

                res.render('dashboard_participant', {
                    username: req.session.username,
                    events,
                    registeredEventIds,
                    tokens
                });
            });
            


        });
    });
});
});

// Handle participant registration for an event
app.post('/participant/register/:eventId', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');

    const user_id = req.session.userId;
    const event_id = req.params.eventId;
    const { student_name, age, contact, college_id, course } = req.body;

    if (!student_name || !age || !contact || !college_id) {
        return res.render('participant_register', { error: 'Please fill all required fields' });
    }

    // 1️⃣ Check if participant already exists
    db.query('SELECT * FROM participant WHERE user_id = ?', [user_id], (err, participantResult) => {
        if (err) throw err;

        let participant_id;

        if (participantResult.length === 0) {
            // 2️⃣ Insert new participant
            db.query(
                'INSERT INTO participant (user_id, student_name, age, contact, college_id, course) VALUES (?, ?, ?, ?, ?, ?)',
                [user_id, student_name, age, contact, college_id, course || ''],
                (err, result) => {
                    if (err) throw err;
                    participant_id = result.insertId;

                    registerEventAndQR(participant_id, event_id, res);
                }
            );
        } else {
            // 3️⃣ Participant exists
            participant_id = participantResult[0].student_id;
            registerEventAndQR(participant_id, event_id, res);
        }
    });
});
// After participant registers for event
const foodTokenIds = [401, 402, 403]; // Breakfast, Lunch, Dinner

foodTokenIds.forEach(tokenId => {
    db.query(
        'INSERT INTO participant_token (student_id, token_id, stats) VALUES (?, ?, "issued") ON DUPLICATE KEY UPDATE stats=stats',
        [participant_id, tokenId]
    );
});
app.post('/food-token/scan', (req, res) => {
    const { token_code } = req.body;
    // Find participant by token
    db.query('SELECT student_id, token_id, stats FROM participant_token WHERE token_id = ? AND stats="issued"', [token_code], (err, result) => {
        if(err) throw err;
        if(result.length === 0) return res.send('Token invalid or already used');

        const { student_id, token_id } = result[0];
        db.query('UPDATE participant_token SET stats=? WHERE student_id=? AND token_id=?', ['lunch_used', student_id, token_id], (err) => {
            if(err) throw err;
            res.send('Token used successfully!');
        });
    });
});


// Helper function: register event and generate QR if not exists
function registerEventAndQR(participant_id, event_id, res) {
    // Check if participant already registered for this event
    db.query(
        'SELECT * FROM participant_event WHERE student_id = ? AND event_id = ?',
        [participant_id, event_id],
        (err, result) => {
            if (err) throw err;

            if (result.length === 0) {
                // Register participant for this event
                db.query(
                    'INSERT INTO participant_event (student_id, event_id) VALUES (?, ?)',
                    [participant_id, event_id],
                    (err) => {
                        if (err) throw err;
                        generateQR(participant_id, event_id, res);
                    }
                );
            } else {
                // Already registered, just show QR
                generateQR(participant_id, event_id, res);
            }
        }
    );
}

// Generate or fetch participant QR
function generateQR(participant_id, event_id, res) {
    db.query('SELECT * FROM participant_qr WHERE student_id = ?', [participant_id], (err, qrResult) => {
        if (err) throw err;

        if (qrResult.length === 0) {
            // Generate new QR
            const crypto = require('crypto');
            const qr_token = crypto.randomBytes(12).toString('hex').toUpperCase();

            db.query(
                'INSERT INTO participant_qr (student_id, qr_token) VALUES (?, ?)',
                [participant_id, qr_token],
                (err) => {
                    if (err) throw err;

                    res.render('participant_qr', {
                        qr_url: `https://api.qrserver.com/v1/create-qr-code/?data=${qr_token}&size=200x200`,
                        participant_id,
                        event_id
                    });
                }
            );
        } else {
            // QR already exists
            const qr_token = qrResult[0].qr_token;
            res.render('participant_qr', {
                qr_url: `https://api.qrserver.com/v1/create-qr-code/?data=${qr_token}&size=200x200`,
                participant_id,
                event_id
            });
        }
    });
}
