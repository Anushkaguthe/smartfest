

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
// Wrap MySQL queries in a promise so we can use async/await
function dbQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}



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


/*app.post('/login', async(req, res) => {
    const { username, password } = req.body;

    // ✅ Step 1: Admin check
    if (username === "piya" && password === "SuperSecretAdmin123") {
        req.session.username = username;
        req.session.isAdmin = true;
        return res.redirect('/dashboard/admin');
    }


    const judgeResults = await dbQuery(
            'SELECT judge_id, judge_name FROM judges WHERE username = ?',
            [username]
        );

        if (judgeResults.length > 0) {
            const judge = judgeResults[0];
            if (password == judge.judge_id) {  // password is judge_id
                req.session.userId = judge.judge_id;
                req.session.username = judge.judge_name;
                req.session.isJudge = true;
                return res.redirect('/dashboard/judge');
            } else {
                return res.render('login', { error: 'Invalid password for judge' });
            }
        }

    // ✅ Step 2: Participant login
    const query = `SELECT * FROM user_account WHERE username = ?`;
    db.query(query, [username], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Server error");
        }

        // No user found
        if (results.length === 0) {
            return res.render("login", { error: "Invalid username or password" });
        }

        const user = results[0];

        // ✅ Compare password using bcrypt
        bcrypt.compare(password, user.password_hash, (err, isMatch) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Server error");
            }

            if (!isMatch) {
                return res.render("login", { error: "Invalid username or password" });
            }

            // ✅ Successful participant login
            req.session.userId = user.user_id;
            req.session.username = user.username;
            req.session.isAdmin = false;

            return res.redirect('/dashboard/participant');
        });
    });
});*/
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // 1️⃣ Admin
        if (username === "piya" && password === "SuperSecretAdmin123") {
            req.session.username = username;
            req.session.isAdmin = true;
            return res.redirect('/dashboard/admin');
        }

        // 2️⃣ Judge
        const judgeResults = await dbQuery(
            'SELECT judge_id, judge_name FROM judges WHERE judge_name = ?',
            [username]  // <- must be judge_name, not username
        );

        if (judgeResults.length > 0) {
            const judge = judgeResults[0];
            if (password == judge.judge_id) {  // password is judge_id
                req.session.userId = judge.judge_id;
                req.session.username = judge.judge_name;
                req.session.isJudge = true;
                return res.redirect('/dashboard/judge');
            } else {
                return res.render('login', { error: 'Invalid password for judge' });
            }
        }

        // 3️⃣ Participant
        const participantResults = await dbQuery(
            'SELECT user_id, username, password_hash FROM user_account WHERE username = ?',
            [username]
        );

        if (participantResults.length === 0) {
            return res.render('login', { error: 'Invalid username' });
        }

        const user = participantResults[0];

        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.render('login', { error: 'Invalid password' });
        }

        req.session.userId = user.user_id;
        req.session.username = user.username;
        req.session.isAdmin = false;
        req.session.isJudge = false;

        res.redirect('/dashboard/participant');

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


app.get('/login', (req, res) => {
    res.render('login', { error: '' });
});
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});



// Admin dashboard
app.get('/dashboard/admin', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).send('Access Denied');
    }

    try {
        const participants = await dbQuery(`
            SELECT p.student_id AS id, p.student_name, p.age, p.contact, u.username
            FROM participant p
            JOIN user_account u ON p.user_id = u.user_id
        `);

        const events = await dbQuery(`
            SELECT event_id, event_name, venue, event_date
            FROM event_s
            ORDER BY event_date ASC
        `);

        res.render('dashboard_admin', {
            username: req.session.username,
            participants,
            events
        });

    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.status(500).send('Error loading admin dashboard');
    }
});



// participant dashboard
const QRCode = require('qrcode');

// Participant dashboard
app.get('/dashboard/participant', async (req, res) => {
    try {
        const user_id = req.session.userId;
        const username = req.session.username;

        if (!user_id) return res.redirect('/login');

        // 1️⃣ Get participant ID
        const participants = await dbQuery('SELECT student_id, student_name FROM participant WHERE user_id=?', [user_id]);
        if (participants.length === 0) {
            return res.render('dashboard_participant', { 
                username, events: [], registeredEventIds: [], tokens: [], student_id: null, qr: null, tokenStatus: null 
            });
        }
        const student_id = participants[0].student_id;

        // 2️⃣ Fetch all events
        const events = await dbQuery('SELECT * FROM event_s ORDER BY event_date ASC');

        // 3️⃣ Fetch registered events
        const registeredEvents = await dbQuery('SELECT event_id FROM participant_event WHERE student_id=?', [student_id]);
        const registeredEventIds = registeredEvents.map(e => e.event_id);

        // 4️⃣ Fetch participant tokens
        const tokens = await dbQuery(`
            SELECT pt.token_id, t.token_type, pt.stats, pt.token_code
            FROM participant_token pt
            JOIN token t ON pt.token_id = t.token_id
            WHERE pt.student_id = ?`, [student_id]);

        // 5️⃣ Fetch existing QR token
        const qrResult = await dbQuery('SELECT qr_token FROM participant_qr WHERE student_id=?', [student_id]);
        let qr = null;
        if (qrResult.length > 0) {
            qr = `https://api.qrserver.com/v1/create-qr-code/?data=${qrResult[0].qr_token}&size=200x200`;
        }

        // Render dashboard
        res.render('dashboard_participant', {
            username,
            events,
            registeredEventIds,
            tokens,
            student_id,
            qr,
            tokenStatus: tokens.length > 0 ? tokens[0].stats : null
        });

    } catch (err) {
        console.error(err);
        res.send('Server error');
    }
});

// ---------- JUDGE DASHBOARD & GRADING -----------
// Require you have dbQuery defined earlier in file (the helper Promise wrapper)

/**
 * GET /dashboard/judge
 * - show events this judge is assigned to (based on event_judge / roles)
 * - fallback: show all events if no assignment found
 */

/**
 * GET /dashboard/judge/event/:eventId
 * - show all participants registered for eventId
 * - show existing score (if judge already graded) and provide a form to submit/update.
 */
/*app.get('/dashboard/judge', async (req, res) => {
    if (!req.session.isJudge) return res.status(403).send('Access denied');

    try {
        // Example: show participants of Hackathon (event_id = 1)
        const participants = await dbQuery(`
            SELECT p.student_id, p.student_name, p.contact, p.college_id, p.course
            FROM participant_event pe
            JOIN participant p ON pe.student_id = p.student_id
            WHERE pe.event_id = 1
        `);

        res.render('dashboard_judge', { username: req.session.username, participants });
    } catch (err) {
        console.error(err);
        res.send('Server error');
    }
});
*/
app.get('/dashboard/judge', async (req, res) => {
    try {
        if (!req.session.isJudge) return res.status(403).send('Access denied');

        const judgeId = req.session.userId; // e.g., 301

        // 1️⃣ Get events assigned to this judge
        const judgeEvents = await dbQuery(
            `SELECT e.event_id, e.event_name, e.venue
FROM Event_s e
JOIN Event_judge ej ON e.event_id = ej.event_id
WHERE ej.judge_id = 301;
`,
            [judgeId]
        );

        // 2️⃣ For each event, get participants
        let eventParticipants = [];
        for (let event of judgeEvents) {
            const participants = await dbQuery(
                `SELECT p.student_id, p.student_name, p.age, p.contact, c.college_name
                 FROM participant p
                 LEFT JOIN college c ON p.college_id = c.college_id
                 JOIN participant_event pe ON p.student_id = pe.student_id
                 WHERE pe.event_id = ?`,
                [event.event_id]
            );
            eventParticipants.push({ ...event, participants });
        }

        // Render dashboard
        res.render('dashboard_judge', {
            username: req.session.username,
            eventParticipants
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


/**
 * POST /dashboard/judge/event/:eventId/grade
 * - Save or update a judge's score for a participant
 */
/*app.post('/judge/grade/:studentId', async (req, res) => {
    if (!req.session.isJudge) return res.status(403).send('Access denied');

    const studentId = req.params.studentId;
    const { score } = req.body;

    try {
        await dbQuery(
            'INSERT INTO participant_grades (student_id, judge_id, score) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE score=?',
            [studentId, req.session.userId, score, score]
        );

        res.redirect('/dashboard/judge');
    } catch (err) {
        console.error(err);
        res.send('Server error');
    }
});
*/
app.post('/judge/grade/:studentId/:eventId', async (req, res) => {
    const { studentId, eventId } = req.params;
    const { grade } = req.body;

    try {
        if (!req.session.isJudge) return res.status(403).send('Access denied');

        // Insert or update grade
        await dbQuery(
            `INSERT INTO judge_grades (judge_id, student_id, event_id, grade)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE grade = ?`,
            [req.session.userId, studentId, eventId, grade, grade]
        );

        res.redirect('/dashboard/judge');

    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});





// Generate food token
app.post('/generate-food-token', async (req, res) => {
    try {
        const user_id = req.session.userId;
        if (!user_id) return res.redirect('/login');

        // 1️⃣ Get or create participant
        let participants = await dbQuery('SELECT student_id FROM participant WHERE user_id=?', [user_id]);
        let student_id;

        if (participants.length === 0) {
            // Auto-create participant
            const result = await dbQuery(
                'INSERT INTO participant (user_id, student_name, age, contact, college_id, course) VALUES (?, ?, ?, ?, ?, ?)',
                [user_id, 'Auto Student', 18, '0000000000', 1, 'N/A']
            );
            student_id = result.insertId;
        } else {
            student_id = participants[0].student_id;
        }

        // 2️⃣ Check if food token exists
        const tokens = await dbQuery(
            'SELECT * FROM participant_token WHERE student_id=? AND token_id=?',
            [student_id, 401]
        );

        let qr = null;
        let tokenStatus = null;

        if (tokens.length > 0) {
            // Already issued
            qr = await QRCode.toDataURL(String(tokens[0].token_code));
            tokenStatus = tokens[0].stats;
        } else {
            // Create new token
            const tokenCode = `FOOD-${student_id}-${Date.now()}`;
            await dbQuery(
                'INSERT INTO participant_token (student_id, token_id, stats, token_code) VALUES (?, ?, "issued", ?)',
                [student_id, 401, tokenCode]
            );
            qr = await QRCode.toDataURL(tokenCode);
            tokenStatus = 'issued';
        }

        // 3️⃣ Render dashboard with QR and status
        const events = await dbQuery('SELECT * FROM event_s ORDER BY event_date ASC');
        const registeredEvents = await dbQuery('SELECT event_id FROM participant_event WHERE student_id=?', [student_id]);
        const registeredEventIds = registeredEvents.map(e => e.event_id);

        res.render('dashboard_participant', {
            username: req.session.username,
            student_id,
            events,
            registeredEventIds,
            tokens: tokens.length > 0 ? tokens : [],
            qr,
            tokenStatus
        });

    } catch (err) {
        console.error(err);
        res.send('Error generating token');
    }
});



// Handle participant registration for an event
/*app.post('/participant/register/:eventId', (req, res) => {
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
*/
app.get('/participant/register/:eventId', async (req, res) => {
    const eventId = req.params.eventId;

    try {
        // Fetch event details
        const events = await dbQuery('SELECT * FROM Event_s WHERE event_id = ?', [eventId]);
        if (events.length === 0) return res.send('Event not found');
        const event = events[0];

        // Fetch colleges
        const colleges = await dbQuery('SELECT * FROM college'); // make sure your table is 'college'

        // Render registration page
        res.render('participant_register', { event, colleges, error: '' });

    } catch (err) {
        console.error(err);
        res.send('Server error');
    }
});

app.post('/participant/register/:eventId', async (req, res) => {
    const eventId = req.params.eventId;
    const userId = req.session.userId;

    if (!userId) return res.redirect('/login');

    const { student_name, age, contact, college_id, course } = req.body;

    if (!student_name || !age || !contact || !college_id) {
        // Fetch event and colleges again to re-render form with error
        const event = (await dbQuery('SELECT * FROM Event_s WHERE event_id = ?', [eventId]))[0];
        const colleges = await dbQuery('SELECT * FROM college');
        return res.render('participant_register', {
            event,
            colleges,
            error: 'Please fill all required fields'
        });
    }

    try {
        // 1️⃣ Check if participant already exists
        let participants = await dbQuery('SELECT * FROM participant WHERE user_id = ?', [userId]);
        let participantId;

        if (participants.length === 0) {
            // Insert new participant
            const result = await dbQuery(
                'INSERT INTO participant (user_id, student_name, age, contact, college_id, course) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, student_name, age, contact, college_id, course || 'N/A']
            );
            participantId = result.insertId;
        } else {
            participantId = participants[0].student_id;
        }

        // 2️⃣ Register for event if not already registered
        const reg = await dbQuery(
            'SELECT * FROM participant_event WHERE student_id = ? AND event_id = ?',
            [participantId, eventId]
        );

        if (reg.length === 0) {
            await dbQuery(
                'INSERT INTO participant_event (student_id, event_id) VALUES (?, ?)',
                [participantId, eventId]
            );
        }

        // 3️⃣ Generate or fetch QR
        let qrResult = await dbQuery('SELECT * FROM participant_qr WHERE student_id = ?', [participantId]);
        let qrToken;
        if (qrResult.length === 0) {
            const crypto = require('crypto');
            qrToken = crypto.randomBytes(12).toString('hex').toUpperCase();
            await dbQuery('INSERT INTO participant_qr (student_id, qr_token) VALUES (?, ?)', [participantId, qrToken]);
        } else {
            qrToken = qrResult[0].qr_token;
        }

        res.render('participant_qr', {
            qr_url: `https://api.qrserver.com/v1/create-qr-code/?data=${qrToken}&size=200x200`,
            participant_id: participantId,
            event_id: eventId
        });

    } catch (err) {
        console.error(err);
        res.send('Server error');
    }
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



