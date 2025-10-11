// Verify QR and show participant info
router.get('/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("QR Token missing");

  try {
    const [qrData] = await db.promise().query(
      "SELECT * FROM participant_qr WHERE qr_token = ?", [token]
    );

    if (qrData.length === 0) {
      return res.status(404).send("Invalid QR Code");
    }

    const participantId = qrData[0].student_id;

    // Fetch participant details
    const [participant] = await db.promise().query(
      "SELECT * FROM participant WHERE student_id = ?", [participantId]
    );

    // Fetch all events the participant registered for
    const [events] = await db.promise().query(
      `SELECT e.event_name 
       FROM participant_event pe 
       JOIN event_s e ON pe.event_id = e.event_id 
       WHERE pe.student_id = ?`, [participantId]
    );

    res.render('verify', {
      participant: participant[0],
      events,
      valid: true
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});
