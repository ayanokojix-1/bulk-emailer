# BulkSend

A focused, single-user bulk email workspace built with Express, Nodemailer, and a local JSON database.

Create saved contact batches, compose a personalized campaign, and send each email individually through Gmail.

## Features

- One-time account setup — only one user can own the workspace.
- Secure password storage using Node's `scrypt` hashing.
- Paste and save contact batches with a clear title.
- Removes duplicate email addresses in each imported batch.
- Personalized message variables: `{{name}}` and `{{email}}`.
- Sends emails individually, never as a group message.
- Tracks sent contacts and recent campaign activity.
- Responsive browser interface.
- Installable PWA with an offline app shell and a custom BulkSend icon.

## Requirements

- Node.js 18 or newer
- A Gmail account with a [Gmail App Password](https://support.google.com/accounts/answer/185833)

## Setup

1. Install the dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and enter your Gmail details:

   ```env
   PORT=3000
   GMAIL_USER=your-gmail-address@gmail.com
   GMAIL_APP_PASSWORD=your-16-character-gmail-app-password
   ```

   `GMAIL_APP_PASSWORD` is an App Password generated in your Google Account. It is not your normal Gmail password.

4. Start the app:

   ```bash
   npm start
   ```

5. Visit [http://localhost:3000](http://localhost:3000).

On the first visit, create the workspace account. Once created, no second account can be registered.

## How to use it

1. Open **Contact batches** in the sidebar.
2. Give the batch a useful name, such as `Orlando property managers`.
3. Paste one contact per line. Either format works:

   ```text
   hello@example.com
   hello@example.com - Example Company
   ```

4. Save the batch.
5. Open **New campaign**, choose the batch, add a subject and message, then send.

Use `{{name}}` to insert each contact's name and `{{email}}` to insert their email address.

## Development

Run the server with file watching enabled:

```bash
npm run dev
```

## Data and security notes

- Workspace data is stored locally in `data.json` and is excluded from Git.
- `.env` is excluded from Git; never commit your Gmail credentials.
- Browser sessions are held in memory and are cleared whenever the server restarts.
- This app records contacts as sent only after Gmail accepts the individual message.

## Project structure

```text
public/          Frontend HTML, CSS, and JavaScript
server.js        Express API, authentication, persistence, and email delivery
data.json        Automatically generated local application data
.env             Private Gmail configuration
contacts.txt     Original contact-list source file
```
