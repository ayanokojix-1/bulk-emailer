require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join("/data", 'data.json');
const sessions = new Map();
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return { user: null, batches: [], campaigns: [] };
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { user: null, batches: [], campaigns: [] }; }
}
function saveDb(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function id() { return crypto.randomUUID(); }
function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function parseContacts(text) {
  const seen = new Set();
  return text.split(/\r?\n|,/).map((line) => {
    const match = line.match(EMAIL_PATTERN);
    if (!match) return null;
    const email = match[0].toLowerCase();
    if (seen.has(email)) return null;
    seen.add(email);
    let name = line.replace(match[0], '').replace(/\[sent\]/ig, '').replace(/^[\s\-–—,]+|[\s\-–—,]+$/g, '').trim();
    if (!name) name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { email, name, sentAt: null, status: 'ready' };
  }).filter(Boolean);
}
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Please sign in.' });
  req.token = token;
  next();
}
function safeUser(user) { return { email: user.email, createdAt: user.createdAt }; }
function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
}

app.get('/api/setup-status', (req, res) => res.json({ configured: Boolean(loadDb().user) }));
app.post('/api/setup', (req, res) => {
  const db = loadDb();
  if (db.user) return res.status(409).json({ error: 'The account is already configured.' });
  const { email, password } = req.body;
  if (!EMAIL_PATTERN.test(email || '') || !password || password.length < 8) return res.status(400).json({ error: 'Use a valid email and a password of at least 8 characters.' });
  const { salt, hash } = passwordHash(password);
  db.user = { email: email.toLowerCase(), salt, hash, createdAt: new Date().toISOString() };
  saveDb(db);
  const token = id(); sessions.set(token, true);
  res.status(201).json({ token, user: safeUser(db.user) });
});
app.post('/api/login', (req, res) => {
  const db = loadDb(); const { email, password } = req.body;
  if (!db.user || !email || !password) return res.status(401).json({ error: 'Invalid email or password.' });
  const check = passwordHash(password, db.user.salt).hash;
  if (email.toLowerCase() !== db.user.email || !crypto.timingSafeEqual(Buffer.from(check), Buffer.from(db.user.hash))) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = id(); sessions.set(token, true);
  res.json({ token, user: safeUser(db.user) });
});
app.post('/api/logout', auth, (req, res) => { sessions.delete(req.token); res.status(204).end(); });

app.get('/api/dashboard', auth, (req, res) => {
  const db = loadDb();
  const contacts = db.batches.flatMap((b) => b.contacts);
  res.json({ user: safeUser(db.user), batches: db.batches, campaigns: db.campaigns.slice(0, 8), stats: { batches: db.batches.length, contacts: contacts.length, sent: contacts.filter((c) => c.status === 'sent').length } });
});
app.post('/api/batches', auth, (req, res) => {
  const { title, contactsText } = req.body;
  const contacts = parseContacts(contactsText || '');
  if (!title?.trim() || !contacts.length) return res.status(400).json({ error: 'Add a batch name and at least one valid email.' });
  const db = loadDb();
  const batch = { id: id(), title: title.trim(), contacts, createdAt: new Date().toISOString() };
  db.batches.unshift(batch); saveDb(db); res.status(201).json(batch);
});
app.delete('/api/batches/:id', auth, (req, res) => {
  const db = loadDb(); const before = db.batches.length;
  db.batches = db.batches.filter((b) => b.id !== req.params.id);
  if (before === db.batches.length) return res.status(404).json({ error: 'Batch not found.' });
  saveDb(db); res.status(204).end();
});
app.post('/api/send', auth, async (req, res) => {
  const { batchId, subject, message } = req.body;
  const db = loadDb(); const batch = db.batches.find((b) => b.id === batchId);
  if (!batch || !subject?.trim() || !message?.trim()) return res.status(400).json({ error: 'Choose a batch and write a subject and message.' });
  const ready = batch.contacts.filter((c) => c.status !== 'sent');
  if (!ready.length) return res.status(400).json({ error: 'Everyone in this batch has already been sent an email.' });
  const transporter = getTransporter();
  if (!transporter) return res.status(503).json({ error: 'Email is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to .env.' });
  const campaign = { id: id(), batchId, batchTitle: batch.title, subject: subject.trim(), createdAt: new Date().toISOString(), total: ready.length, sent: 0, failed: 0, status: 'sending' };
  db.campaigns.unshift(campaign); saveDb(db); res.status(202).json(campaign);
  for (const contact of ready) {
    try {
      const personalized = message.replace(/{{\s*name\s*}}/ig, contact.name).replace(/{{\s*email\s*}}/ig, contact.email);
      await transporter.sendMail({ from: process.env.GMAIL_USER, to: contact.email, subject: subject.trim(), text: personalized });
      contact.status = 'sent'; contact.sentAt = new Date().toISOString(); campaign.sent++;
    } catch (error) { contact.status = 'failed'; contact.error = error.message; campaign.failed++; }
    saveDb(db);
  }
  campaign.status = 'complete'; saveDb(db);
});

app.listen(PORT, () => console.log(`BulkSend is running at http://localhost:${PORT}`));
