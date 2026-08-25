#!/usr/bin/env node
import { webcrypto } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const PASSWORD = '12345678';
const ITERATIONS = 250_000;
const OUTPUT = 'test-data/life-leaf-notification-demo.lifeleaf';
const { subtle } = webcrypto;

function localDate(value) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function withYear(value, year) {
  return `${year}${value.slice(4)}`;
}

function contentJson(paragraphs) {
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map(text => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  });
}

function entry(id, date, title, paragraphs, options = {}) {
  const timestamp = `${date}T12:00:00.000Z`;
  return {
    id,
    title,
    entryDate: date,
    entryTime: options.time ?? '20:00',
    contentJson: contentJson(paragraphs),
    plainTextContent: paragraphs.join('\n\n'),
    moodId: options.moodId ?? 'calm',
    tagIds: options.tagIds ?? ['personal'],
    favourite: options.favourite ?? false,
    pinned: options.pinned ?? false,
    status: 'active',
    locationText: '',
    weatherText: '',
    attachmentCount: 0,
    photoCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function base64(value) {
  return Buffer.from(value).toString('base64');
}

async function encrypt(data, createdAt) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const material = await subtle.importKey('raw', new TextEncoder().encode(PASSWORD), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return {
    format: 'life-leaf-backup',
    version: 1,
    createdAt,
    encrypted: true,
    iterations: ITERATIONS,
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  };
}

async function decrypt(backup) {
  const salt = Buffer.from(backup.salt, 'base64');
  const iv = Buffer.from(backup.iv, 'base64');
  const material = await subtle.importKey('raw', new TextEncoder().encode(PASSWORD), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: backup.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv }, key, Buffer.from(backup.ciphertext, 'base64'));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

const today = localDate(new Date());
const tomorrow = addDays(today, 1);
const todayValue = new Date(`${today}T12:00:00`).getDay() + 1;
const tomorrowValue = new Date(`${tomorrow}T12:00:00`).getDay() + 1;
const currentYear = Number(today.slice(0, 4));
const lastYearToday = withYear(today, currentYear - 1);
const twoYearsAgoTomorrow = withYear(tomorrow, currentYear - 2);
const createdAt = new Date().toISOString();

const entries = [
  entry(
    'demo-notification-today',
    today,
    'Notification test — today at 8 PM',
    [
      'Life Leaf should show a private writing reminder today at 8:00 PM device time.',
      'After it appears, open the notification and add a short note about what you were doing.',
    ],
    { moodId: 'excited', tagIds: ['personal', 'ideas'], favourite: true },
  ),
  entry(
    'demo-notification-tomorrow',
    tomorrow,
    'Notification test — tomorrow at 8 PM',
    [
      'A second private writing reminder is scheduled for tomorrow at 8:00 PM device time.',
      'This verifies that two selected weekdays are scheduled independently.',
    ],
    { moodId: 'calm', tagIds: ['personal', 'ideas'] },
  ),
  entry(
    'demo-on-this-day-last-year',
    lastYearToday,
    'On this day — reminder memory',
    [
      'One year ago, I tested a gentle evening reminder and took a minute to write.',
      'Small reminders can protect memories that would otherwise disappear into an ordinary day.',
    ],
    { moodId: 'grateful', tagIds: ['memory', 'personal'], favourite: true },
  ),
  entry(
    'demo-on-this-day-two-years-ago',
    twoYearsAgoTomorrow,
    'Tomorrow across the years — notification note',
    [
      'Two years ago on tomorrow’s date, an 8 PM reminder helped me record one calm moment.',
      'Check On this day tomorrow to confirm this earlier-year entry appears.',
    ],
    { moodId: 'calm', tagIds: ['memory'] },
  ),
];

const data = {
  entries,
  moods: [
    { id: 'calm', label: 'Calm', icon: 'leaf-outline', color: '#0f766e', custom: false },
    { id: 'excited', label: 'Excited', icon: 'flash-outline', color: '#d97706', custom: false },
    { id: 'grateful', label: 'Grateful', icon: 'heart-outline', color: '#c24170', custom: false },
  ],
  tags: [
    { id: 'personal', name: 'Personal', color: '#7c3aed', archived: false },
    { id: 'ideas', name: 'Ideas', color: '#c24170', archived: false },
    { id: 'memory', name: 'Memory', color: '#64748b', archived: false },
  ],
  templates: [],
  settings: {
    theme: 'automatic',
    writingPrompts: true,
    showStreak: true,
    onThisDay: true,
    autosaveSeconds: 2,
    weekStartsOnMonday: true,
    reminderEnabled: true,
    reminderTime: '20:00',
    reminderDays: [...new Set([todayValue, tomorrowValue])],
    screenshotProtection: false,
    revisionLimit: 10,
    trashRetentionDays: 0,
  },
  attachments: [],
};

const backup = await encrypt(data, createdAt);
const verified = await decrypt(backup);
if (
  verified.entries.length !== 4 ||
  verified.settings.reminderTime !== '20:00' ||
  !verified.settings.reminderDays.includes(todayValue) ||
  !verified.settings.reminderDays.includes(tomorrowValue)
) {
  throw new Error('Generated Life Leaf notification backup failed verification.');
}

await mkdir('test-data', { recursive: true });
await writeFile(OUTPUT, JSON.stringify(backup), 'utf8');
await writeFile(
  'test-data/README.md',
  `# Life Leaf notification demo backup\n\n- File: \`life-leaf-notification-demo.lifeleaf\`\n- Password: \`12345678\`\n- Generated: ${createdAt}\n- Reminder dates: ${today} and ${tomorrow}\n- Reminder time: 8:00 PM device time\n- Diary entries: two reminder checks plus two earlier-year On this day notes\n\nRestore with Replace for an isolated test. Export your real diary first if needed. Rebuild this date-relative file with \`npm run demo:notification-backup\`.\n`,
  'utf8',
);

console.log(`Created ${OUTPUT}`);
console.log(`Password: ${PASSWORD}`);
console.log(`Expected reminders: ${today} and ${tomorrow} at 20:00 device time`);
