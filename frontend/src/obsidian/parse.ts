import { parse as parseYaml } from 'yaml';
import type { MaterialType } from '../domain/types';

/**
 * Разбор заметок Obsidian. Формат описан в obsidian/README.md:
 * - заметка для повторения — тег `review` (в свойствах или в тексте) или свойство `review: true`;
 * - вопросы — пункты раздела «Вопросы» и выноски `> [!question]`;
 * - ключевые мысли — раздел «Суть»;
 * - материал — свойство `material: "[[Название]]"`, страница материала — свойство `type: material`.
 */

export interface VaultFile {
  /** Путь от корня хранилища: «Заметки/Двоичный поиск.md». */
  path: string;
  content: string;
}

export interface ParsedNote {
  path: string;
  title: string;
  questions: string[];
  summary: string;
  /** Название материала из свойства material, без [[ ]]. */
  materialRef: string | null;
}

export interface ParsedMaterial {
  path: string;
  title: string;
  type: MaterialType;
  author: string;
  url: string;
  areaName: string | null;
}

export type ParsedFile =
  | { kind: 'note'; note: ParsedNote }
  | { kind: 'material'; material: ParsedMaterial }
  | { kind: 'skip'; reason: 'template' | 'not-review' };

const QUESTION_SECTIONS = ['вопросы', 'вопросы для самопроверки', 'questions'];
const SUMMARY_SECTIONS = ['суть', 'коротко', 'главное', 'ключевые мысли', 'summary', 'tl;dr', 'tldr'];
const QUESTION_CALLOUTS = ['question', 'faq', 'help', 'вопрос'];
const SUMMARY_LIMIT = 2000;

const MATERIAL_TYPE_NAMES: Record<string, MaterialType> = {
  book: 'book',
  книга: 'book',
  course: 'course',
  курс: 'course',
  lecture: 'lecture',
  лекция: 'lecture',
  article: 'article',
  статья: 'article',
  video: 'video',
  видео: 'video',
  other: 'other',
  другое: 'other',
};

// ---------- свойства (frontmatter) ----------

export interface MarkdownDoc {
  frontmatter: Record<string, unknown>;
  body: string;
  /** Свойства есть, но YAML не читается. */
  frontmatterError: boolean;
}

export function splitFrontmatter(text: string): MarkdownDoc {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0].trimEnd() !== '---') return { frontmatter: {}, body: normalized, frontmatterError: false };
  const end = lines.findIndex((line, i) => i > 0 && line.trimEnd() === '---');
  if (end === -1) return { frontmatter: {}, body: normalized, frontmatterError: false };

  const yaml = lines.slice(1, end).join('\n');
  const body = lines.slice(end + 1).join('\n');
  try {
    const data: unknown = yaml.trim() ? parseYaml(yaml) : {};
    const frontmatter = typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
    return { frontmatter, body, frontmatterError: false };
  } catch {
    return { frontmatter: {}, body, frontmatterError: true };
  }
}

function stringProp(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

// ---------- текст ----------

/** Убирает комментарии Obsidian %%…%% и HTML-комментарии. */
export function stripComments(text: string): string {
  return text.replace(/%%[\s\S]*?%%/g, '').replace(/<!--[\s\S]*?-->/g, '');
}

/** Убирает блоки кода и `код`: теги и заголовки внутри них не считаются. */
function stripCode(text: string): string {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '').replace(/`[^`\n]*`/g, '');
}

/** [[Файл|подпись]] → подпись, [[Файл]] → Файл, **жирный** → жирный. */
export function plainText(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_, target: string) => target.split('#')[0].split('/').pop() ?? target)
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** Цель ссылки из свойства: "[[Папка/Название|подпись]]" → «Название». Пустая ссылка — null. */
export function linkTarget(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  const link = /^\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/.exec(text);
  const target = (link ? link[1] : text).trim();
  const name = target.split('/').pop()?.replace(/\.md$/i, '').trim() ?? '';
  return name || null;
}

// ---------- теги ----------

export function extractTags(frontmatter: Record<string, unknown>, body: string): string[] {
  const tags = new Set<string>();
  const add = (tag: string) => {
    const clean = tag.trim().replace(/^#/, '').toLowerCase();
    if (clean) tags.add(clean);
  };

  for (const key of ['tags', 'tag']) {
    const value = frontmatter[key];
    if (Array.isArray(value)) value.forEach((t) => typeof t === 'string' && add(t));
    else if (typeof value === 'string') value.split(/[,\s]+/).forEach(add);
  }

  const text = stripCode(stripComments(body));
  // Тег — # и буквы/цифры/_/-//, не в середине слова и не после «/» (якорь в ссылке).
  for (const match of text.matchAll(/(^|[^\p{L}\p{N}_/&#])#([\p{L}\p{N}_/-]+)/gu)) {
    if (/[^\d]/u.test(match[2])) add(match[2]);
  }
  return [...tags];
}

// ---------- разделы ----------

interface Section {
  title: string;
  level: number;
  content: string;
}

function normalizeHeading(title: string): string {
  return title
    .toLowerCase()
    .replace(/[:：]\s*$/, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
}

export function sections(body: string): Section[] {
  const lines = body.split('\n');
  const found: { title: string; level: number; line: number }[] = [];
  let fence: string | null = null;
  lines.forEach((line, i) => {
    const fenceMatch = /^(```|~~~)/.exec(line);
    if (fenceMatch) {
      fence = fence === null ? fenceMatch[1] : fence === fenceMatch[1] ? null : fence;
      return;
    }
    if (fence) return;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) found.push({ title: heading[2], level: heading[1].length, line: i });
  });

  return found.map((h, index) => {
    const next = found.slice(index + 1).find((other) => other.level <= h.level);
    const content = lines.slice(h.line + 1, next ? next.line : lines.length).join('\n');
    return { title: h.title, level: h.level, content };
  });
}

function findSection(body: string, names: string[]): Section | undefined {
  return sections(body).find((s) => names.includes(normalizeHeading(s.title)));
}

/** Пункты списка верхнего уровня: «- текст», «* текст», «1. текст», «- [ ] текст». */
export function listItems(content: string): string[] {
  const items: { indent: number; text: string }[] = [];
  for (const line of content.split('\n')) {
    const match = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*\S)\s*$/.exec(line);
    if (match) items.push({ indent: match[1].replace(/\t/g, '    ').length, text: match[2] });
  }
  if (items.length === 0) return [];
  const top = Math.min(...items.map((i) => i.indent));
  return items.filter((i) => i.indent === top).map((i) => plainText(i.text)).filter(Boolean);
}

/** Вопросы из выносок `> [!question] Текст` или `> [!question]` с текстом на следующих строках. */
export function calloutQuestions(body: string): string[] {
  const lines = stripCode(body).split('\n');
  const questions: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^>\s*\[!([^\]]+)\][+-]?\s*(.*)$/.exec(lines[i]);
    if (!match || !QUESTION_CALLOUTS.includes(match[1].trim().toLowerCase())) continue;
    let text = match[2].trim();
    if (!text) {
      const rest: string[] = [];
      for (let j = i + 1; j < lines.length && /^>/.test(lines[j]); j++) {
        const line = lines[j].replace(/^>\s?/, '').trim();
        if (line) rest.push(line);
      }
      text = rest.join(' ');
    }
    const question = plainText(text);
    if (question) questions.push(question);
  }
  return questions;
}

function extractSummary(body: string): string {
  const section = findSection(body, SUMMARY_SECTIONS);
  if (!section) return '';
  const text = section.content
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT).trimEnd()}…` : text;
}

function fileTitle(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

// ---------- файл целиком ----------

/** Шаблоны Obsidian содержат {{title}} и {{date}} — их пропускаем. */
function isTemplate(content: string): boolean {
  return /\{\{\s*(title|date|time)\b/.test(content);
}

export function parseVaultFile(file: VaultFile): ParsedFile {
  if (isTemplate(file.content)) return { kind: 'skip', reason: 'template' };
  const { frontmatter, body } = splitFrontmatter(file.content);
  const title = stringProp(frontmatter.title) || fileTitle(file.path);

  if (stringProp(frontmatter.type).toLowerCase() === 'material') {
    const url = stringProp(frontmatter.url);
    return {
      kind: 'material',
      material: {
        path: file.path,
        title,
        type: MATERIAL_TYPE_NAMES[stringProp(frontmatter['material-type']).toLowerCase()] ?? 'other',
        author: stringProp(frontmatter.author),
        url: /^https?:\/\//.test(url) ? url : '',
        areaName: stringProp(frontmatter.area) || null,
      },
    };
  }

  const tags = extractTags(frontmatter, body);
  const isReview = frontmatter.review === true || tags.some((t) => t === 'review' || t.startsWith('review/'));
  if (!isReview) return { kind: 'skip', reason: 'not-review' };

  const clean = stripComments(body);
  const section = findSection(clean, QUESTION_SECTIONS);
  const questions = [...(section ? listItems(section.content) : []), ...calloutQuestions(clean)];

  return {
    kind: 'note',
    note: {
      path: file.path,
      title,
      questions: [...new Set(questions)],
      summary: extractSummary(clean),
      materialRef: linkTarget(frontmatter.material),
    },
  };
}

export interface ParsedVault {
  vaultName: string;
  notes: ParsedNote[];
  materials: ParsedMaterial[];
  filesRead: number;
}

export function parseVault(vaultName: string, files: VaultFile[]): ParsedVault {
  const notes: ParsedNote[] = [];
  const materials: ParsedMaterial[] = [];
  for (const file of files) {
    const parsed = parseVaultFile(file);
    if (parsed.kind === 'note') notes.push(parsed.note);
    else if (parsed.kind === 'material') materials.push(parsed.material);
  }
  return { vaultName, notes, materials, filesRead: files.length };
}
