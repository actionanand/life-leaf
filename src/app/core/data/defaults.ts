import { DiarySettings, DiaryTag, EntryTemplate, Mood } from '../models/diary.models';

export const DEFAULT_TAGS: DiaryTag[] = [
  ['family', 'Family', '#b45309'],
  ['work', 'Work', '#2563eb'],
  ['travel', 'Travel', '#0f766e'],
  ['personal', 'Personal', '#7c3aed'],
  ['ideas', 'Ideas', '#c24170'],
  ['health', 'Health', '#2f855a'],
  ['achievement', 'Achievement', '#ca8a04'],
  ['memory', 'Memory', '#64748b'],
].map(([id, name, color]) => ({ id, name, color, archived: false }));

export const DEFAULT_MOODS: Mood[] = [
  ['excellent', 'Excellent', 'sparkles', '#2f855a'],
  ['happy', 'Happy', 'happy-outline', '#65a30d'],
  ['calm', 'Calm', 'leaf-outline', '#0f766e'],
  ['excited', 'Excited', 'flash-outline', '#d97706'],
  ['grateful', 'Grateful', 'heart-outline', '#c24170'],
  ['neutral', 'Neutral', 'remove-outline', '#64748b'],
  ['tired', 'Tired', 'moon-outline', '#6366f1'],
  ['stressed', 'Stressed', 'pulse-outline', '#b45309'],
  ['anxious', 'Anxious', 'rainy-outline', '#7c3aed'],
  ['sad', 'Sad', 'sad-outline', '#2563eb'],
  ['angry', 'Angry', 'flame-outline', '#dc2626'],
].map(([id, label, icon, color]) => ({ id, label, icon, color, custom: false }));

const doc = (paragraphs: string[]) =>
  JSON.stringify({
    type: 'doc',
    content: paragraphs.flatMap(text => [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] },
      { type: 'paragraph' },
    ]),
  });

export const DEFAULT_TEMPLATES: EntryTemplate[] = [
  {
    id: 'daily-reflection',
    name: 'Daily reflection',
    description: 'A gentle check-in for the end of your day.',
    contentJson: doc([
      'What happened today?',
      'What made me happy?',
      'What was difficult?',
      'What am I grateful for?',
      'Tomorrow I want to…',
    ]),
    builtIn: true,
  },
  {
    id: 'quick-journal',
    name: 'Quick journal',
    description: 'Capture the essentials in a minute.',
    contentJson: doc(['Today…', 'Mood…', 'One thing to remember…']),
    builtIn: true,
  },
  {
    id: 'gratitude',
    name: 'Gratitude',
    description: 'Notice the good that was already here.',
    contentJson: doc(["Today I'm grateful for…"]),
    builtIn: true,
  },
  {
    id: 'travel',
    name: 'Travel diary',
    description: 'Keep the texture of a place with you.',
    contentJson: doc(['Place', 'What I did', 'Favourite moment', 'Things to remember']),
    builtIn: true,
  },
];

export const DEFAULT_SETTINGS: DiarySettings = {
  theme: 'automatic',
  writingPrompts: true,
  showStreak: true,
  onThisDay: true,
  autosaveSeconds: 2,
  weekStartsOnMonday: true,
  reminderEnabled: false,
  reminderTime: '20:00',
  reminderDays: [1, 2, 3, 4, 5, 6, 7],
  screenshotProtection: false,
  revisionLimit: 10,
  trashRetentionDays: 0,
};

export const WRITING_PROMPTS = [
  'What made today memorable?',
  'What are you grateful for today?',
  'What did you learn today?',
  'What made you smile?',
  'What would you like to remember about today?',
  'What are you looking forward to?',
  'What challenged you today?',
];
