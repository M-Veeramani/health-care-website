const express = require("express");
const bodyParser = require("body-parser");
const ibmdb = require("ibm_db");
const bcrypt = require("bcrypt");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");
const session = require("express-session");
const { IamAuthenticator } = require("ibm-cloud-sdk-core");
const SpeechToTextV1 = require("ibm-watson/speech-to-text/v1");
const { CloudantV1 } = require("@ibm-cloud/cloudant");

const app = express();
const upload = multer();

// 🗂️ Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(upload.single("audio"));

app.use(session({
  secret: "your_secret_key", // change in production
  resave: false,
  saveUninitialized: true
}));

// 📂 Static routes
app.use(express.static(__dirname));

// 🔗 DB2 Connection String
const DB2_DSN = "DATABASE=bludb;HOSTNAME=824dfd4d-99de-440d-9991-629c01b3832d.bs2io90l08kqb1od8lcg.databases.appdomain.cloud;PORT=30119;PROTOCOL=TCPIP;UID=fmk32016;PWD=JAcNIZ2pYlqQXWz6;Security=SSL";

// 📦 IBM Watson STT Setup
const speechToText = new SpeechToTextV1({
  authenticator: new IamAuthenticator({ apikey: "JG7aSaTt8Pik1-TWrvIH3IKHNQdupDjTEZkRcgqj0Fqo" }),
  serviceUrl: "https://api.eu-gb.speech-to-text.watson.cloud.ibm.com/instances/e7a45253-8ddf-451b-9141-bfc40698db09",
});

// ☁️ Cloudant Setup
const cloudant = CloudantV1.newInstance({
  authenticator: new IamAuthenticator({ apikey: "k6fN80isqwUE9v5zSZEBdG6vC31Oknk2HK8DCpCH7lO6" }),
});
cloudant.setServiceUrl("https://b88eddc4-8ab9-477f-94f0-1c353ee23cf2-bluemix.cloudantnosqldb.appdomain.cloud");
const cloudantDbName = "health";

// 🏠 Routes
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "begin.html")));
app.get("/signup.html", (req, res) => res.sendFile(path.join(__dirname, "signup.html")));
app.get("/dashboard.html", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/doctors.html", (req, res) => res.sendFile(path.join(__dirname, "doctors.html")));
app.get("/about.html", (req, res) => res.sendFile(path.join(__dirname, "about.html")));
app.get("/contact.html", (req, res) => res.sendFile(path.join(__dirname, "contact.html")));
app.get("/chat.html", (req, res) => res.sendFile(path.join(__dirname, "chat.html")));
app.get("/consult.html", (req, res) => res.sendFile(path.join(__dirname, "consult.html")));
app.get("/doctordashboard.html", (req, res) => res.sendFile(path.join(__dirname, "doctordashboard.html")));

// 🔐 Signup Route
app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  ibmdb.open(DB2_DSN, (err, conn) => {
    if (err) return res.status(500).send("DB connection error");
    const query = "INSERT INTO Users (name, email, password_hash) VALUES (?, ?, ?)";
    conn.query(query, [name, email, hashedPassword], (err) => {
      conn.closeSync();
      if (err) return res.status(400).send("Signup failed.");
      res.redirect("/login.html");
    });
  });
});

// 🔓 User Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  ibmdb.open(DB2_DSN, (err, conn) => {
    if (err) return res.status(500).send("DB error");
    const query = "SELECT * FROM Users WHERE email = ?";
    conn.query(query, [email], async (err, data) => {
      conn.closeSync();
      if (err || data.length === 0) return res.status(401).send("Invalid credentials");
      const match = await bcrypt.compare(password, data[0].PASSWORD_HASH);
      if (match) {
        req.session.email = email;
        res.redirect("/dashboard.html");
      } else res.status(401).send("Invalid credentials");
    });
  });
});

// 👨‍⚕️ Doctor Login (non-hashed)
app.post("/doctor-login", (req, res) => {
  const { email, password } = req.body;
  ibmdb.open(DB2_DSN, (err, conn) => {
    if (err) return res.status(500).send("DB error");
    conn.query("SELECT * FROM doctor_login WHERE email = ? AND password = ?", [email, password], (err, data) => {
      conn.closeSync();
      if (err || data.length === 0) return res.status(401).send("Invalid credentials");
      req.session.doctorEmail = email;
      res.redirect("/doctordashboard.html");
    });
  });
});

// 🩺 Fetch Doctors
app.get("/doctors", (req, res) => {
  ibmdb.open(DB2_DSN, (err, conn) => {
    if (err) return res.status(500).json({ error: "DB error" });
    conn.query("SELECT * FROM Doctors", (err, data) => {
      conn.close();
      if (err) return res.status(500).json({ error: "Query error" });
      const formatted = data.map(doc => ({
        name: doc.NAME,
        specialization: doc.SPECIALIZATION,
        experience: doc.EXPERIENCE,
        email: doc.EMAIL,
        contact: doc.CONTACT,
        profile_image_url: doc.PROFILE_IMAGE_URL
      }));
      res.json(formatted);
    });
  });
});

// 📆 Book Appointment
app.post("/book-appointment", (req, res) => {
  const { doctor,doctorEmail,email, date } = req.body;
  ibmdb.open(DB2_DSN, (err, conn) => {
    if (err) return res.status(500).send("DB error");
    const query = "INSERT INTO Booked (doctor_name, doctor_email, patient_email, appointment_date) VALUES (?, ?, ?,?)";
    conn.query(query, [doctor,doctorEmail ,email, date], (err) => {
      conn.closeSync();
      if (err) return res.status(500).send("Insert failed");

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: "ashvanth932006@gmail.com", pass: "kotn dnou gigp ttus" }
      });

      const mailOptions = {
        from: "ashvanth932006@gmail.com",
        to: email,
        subject: "Appointment Confirmation",
        text: `Your appointment with Dr. ${doctor} is confirmed for ${date}.`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) return res.status(500).send("Email failed");
        res.send("Appointment booked and confirmation sent!");
      });
    });
  });
});

// 🧠 IBM STT + Cloudant Storage
app.post("/stt", async (req, res) => {
  const audioBuffer = req.file?.buffer;
  const doctorEmail = req.query.doctor; // from ?doctor=email in frontend
  const patientEmail = req.session.email; // from session

  if (!audioBuffer) return res.status(400).send("No audio received");
  if (!doctorEmail || !patientEmail) return res.status(400).send("Missing doctor or patient email");

  try {
    const result = await speechToText.recognize({
      audio: audioBuffer,
      contentType: 'audio/webm',
    });

    const transcript = result.result.results
      .map(r => r.alternatives[0].transcript)
      .join(" ");

    await cloudant.postDocument({
      db: "health",
      document: {
        type: "voice_consultation",
        doctor_email: doctorEmail,
        patient_email: patientEmail,
        text: transcript,
        timestamp: new Date().toISOString()
      }
    });

    console.log("📝 Transcribed and stored");
    res.json({ transcript });
  } catch (err) {
    console.error("❌ STT/Cloudant Error:", err);
    res.status(500).send("STT/Cloudant failed");
  }
});


app.post("/consult", express.json(), async (req, res) => {
  const { symptoms, doctorEmail } = req.body;
  const patientEmail = req.session.email;

  if (!symptoms || !patientEmail || !doctorEmail) {
    return res.status(400).send("Missing required fields.");
  }

  const docData = {
    type: "consultation",
    patientEmail,
    doctorEmail,
    symptoms,
    timestamp: new Date().toISOString(),
  };

  try {
    await cloudant.postDocument({ db: "health", document: docData });
    res.send("Consultation saved successfully!");
  } catch (err) {
    console.error("❌ Cloudant insert error:", err);
    res.status(500).send("Failed to save consultation.");
  }
});
app.get("/doctor-session", (req, res) => {
  if (!req.session.doctorEmail) return res.status(401).send("Not logged in");

  res.json({
    email: req.session.doctorEmail,
    name: req.session.doctorName
  });
});
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/doctorlogin.html");
  });
});
app.get("/consultations", async (req, res) => {
  const doctorEmail = req.session.doctorEmail;
  if (!doctorEmail) {
    console.warn("Doctor session not found.");
    return res.status(401).send("Unauthorized");
  }

  try {
    const result = await cloudant.postFind({
      db: "health",
      selector: {
        doctor_email: doctorEmail
      },
    });

    console.log(`Consultations for ${doctorEmail}:`, result.result.docs.length);
    res.json(result.result.docs);
  } catch (error) {
    console.error("❌ Cloudant fetch error:", error);
    res.status(500).send("Failed to load consultations");
  }
});
app.post("/respond", async (req, res) => {
  const doctorEmail = req.session.doctorEmail;
  const { patientEmail, response } = req.body;

  if (!doctorEmail || !patientEmail || !response) {
    return res.status(400).send("Missing required fields");
  }

  try {
    await cloudant.postDocument({
      db: "symptoms",  // use your Cloudant DB name
      document: {
        doctor_email: doctorEmail,
        patient_email: patientEmail,
        response: response,
        timestamp: new Date().toISOString()
      }
    });
    res.send("✅ Response submitted successfully");
  } catch (err) {
    console.error("❌ Cloudant insert failed:", err);
    res.status(500).send("Cloudant insert failed");
  }
});
app.get("/doctor-responses", async (req, res) => {
  const patientEmail = req.session.email; // patient's email from session

  if (!patientEmail) return res.status(401).send("Unauthorized");

  try {
    const result = await cloudant.postFind({
      db: "symptoms", // where doctor responses are stored
      selector: {
        patient_email: patientEmail
      }
    });

    res.json(result.result.docs);
  } catch (err) {
    console.error("❌ Failed to fetch responses:", err);
    res.status(500).send("Cloudant fetch error");
  }
});
app.get("/booked-appointments", (req, res) => {
  const doctorEmail = req.session.doctorEmail;
  if (!doctorEmail) return res.status(401).send("Unauthorized");

  const query = `
    SELECT doctor_name, patient_email, appointment_date, created_at
    FROM Booked
    WHERE doctor_email = ?
    ORDER BY appointment_date DESC
  `;

  ibmdb.open(DB2_DSN, (err, conn) => {
    if (err) return res.status(500).send("DB error");

    conn.query(query, [doctorEmail], (err, data) => {
      conn.closeSync();
      if (err) {
        console.error("DB query failed:", err);
        return res.status(500).send("Failed to retrieve appointments");
      }
      res.json(data);
    });
  });
});

// 🚀 Start Server
const PORT = 2000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));