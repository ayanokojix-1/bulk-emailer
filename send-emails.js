require('dotenv').config();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const CONTACTS_FILE = path.join(__dirname, 'contacts.txt');
const MIN_DELAY_MS = 8000;   // 8s
const MAX_DELAY_MS = 20000;  // 20s (randomized delay to avoid spam-filter flags)

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function parseLine(line) {
  const raw = line.trim();
  if (!raw) return null;

  const match = raw.match(EMAIL_REGEX);
  if (!match) return null;

  const email = match[0];
  const alreadySent = /\[sent\]/i.test(raw);

  let name = raw
    .replace(email, '')
    .replace(/\[sent\]/i, '')
    .replace(/^[\s\-]+/, '')
    .replace(/[\s\-]+$/, '')
    .trim();

  if (!name) {
    // fallback: derive something from the domain, e.g. "keyrenteraustin.com" -> "Keyrenteraustin"
    const domain = email.split('@')[1].split('.')[0];
    name = domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  return { raw, email, name, alreadySent };
}

function buildEmail(name) {
  const subject = `Quick question about ${name}`;
  const text = `Hi ${name},

My name is Koji and I am a software developer. I understand that property/real estate management can be stressful, and the process of some tasks can be time taking. Hence the reason for this email. I build automation tools for businesses that remove the heavy manual time-taking work and give time to focus on other parts of the business. Whether it's manually uploading listings to a spreadsheet, or replying to clients on WhatsApp, I am here to automate it for you.

Feel free to reply if you're interested.

Thanks,
Koji`;
  return { subject, text };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

async function sendOne(contact) {
  const { subject, text } = buildEmail(contact.name);
  return new Promise((resolve, reject) => {
    transporter.sendMail(
      { from: process.env.GMAIL_USER, to: contact.email, subject, text },
      (err, info) => (err ? reject(err) : resolve(info))
    );
  });
}

async function main() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error('Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env');
    process.exit(1);
  }

  const lines = fs.readFileSync(CONTACTS_FILE, 'utf-8').split('\n');
  const contacts = lines.map(parseLine).filter(Boolean);

  const toSend = contacts.filter((c) => !c.alreadySent);
  console.log(`${contacts.length} total contacts, ${toSend.length} to send now.`);

  const updatedLines = [...lines];

  for (const contact of toSend) {
    try {
      await sendOne(contact);
      console.log(`Sent -> ${contact.email} (${contact.name})`);

      // mark as sent in-memory, then flush to disk after each send
      const idx = updatedLines.findIndex((l) => l.includes(contact.email) && !/\[sent\]/i.test(l));
      if (idx !== -1) {
        updatedLines[idx] = updatedLines[idx].trimEnd() + ' [sent]';
        fs.writeFileSync(CONTACTS_FILE, updatedLines.join('\n'));
      }
    } catch (err) {
      console.error(`Failed -> ${contact.email}:`, err.message);
    }

    await delay(randomDelay());
  }

  console.log('Done.');
}

main();
