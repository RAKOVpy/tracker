import { describe, expect, it } from 'vitest';
import { obsidianUri } from './uri';
import {
  calloutQuestions,
  extractTags,
  linkTarget,
  listItems,
  parseVault,
  parseVaultFile,
  splitFrontmatter,
  type ParsedFile,
} from './parse';

/** Пример хранилища из репозитория: тесты проверяют, что формат и парсер согласованы. */
const exampleVault = import.meta.glob('../../../obsidian/example-vault/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function vaultFile(path: string) {
  const key = Object.keys(exampleVault).find((k) => k.endsWith(`example-vault/${path}`));
  if (!key) throw new Error(`Нет файла ${path} в примере хранилища`);
  return { path, content: exampleVault[key] };
}

function asNote(result: ParsedFile) {
  if (result.kind !== 'note') throw new Error(`Ожидалась заметка, получено: ${result.kind}`);
  return result.note;
}

describe('пример хранилища', () => {
  it('заметка по шаблону: вопросы из раздела, суть, материал, дата', () => {
    const note = asNote(parseVaultFile(vaultFile('Заметки/Обход графа в ширину и в глубину.md')));
    expect(note.title).toBe('Обход графа в ширину и в глубину');
    expect(note.questions).toEqual([
      'Почему BFS находит кратчайший путь в невзвешенном графе, а DFS — нет?',
      'Какая структура данных лежит в основе каждого обхода?',
      'Для какой задачи вы выберете DFS и почему?',
    ]);
    expect(note.summary.split('\n')).toHaveLength(3);
    expect(note.summary).toMatch(/^BFS обходит граф слоями/);
    expect(note.materialRef).toBe('Алгоритмы и структуры данных');
  });

  it('заметка в свободной форме: тег в тексте и вопросы-выноски', () => {
    const note = asNote(parseVaultFile(vaultFile('Заметки/Двоичный поиск.md')));
    expect(note.questions).toEqual(['Какое условие обязательно для двоичного поиска?', 'Почему сложность O(log n)?']);
    expect(note.summary).toBe('');
    expect(note.materialRef).toBe('Алгоритмы и структуры данных');
  });

  it('нумерованный список вопросов', () => {
    const note = asNote(parseVaultFile(vaultFile('Заметки/Present Perfect и Past Simple.md')));
    expect(note.questions).toHaveLength(3);
    expect(note.materialRef).toBe('English Grammar in Use');
  });

  it('страница материала', () => {
    const result = parseVaultFile(vaultFile('Материалы/Алгоритмы и структуры данных.md'));
    expect(result).toEqual({
      kind: 'material',
      material: {
        path: 'Материалы/Алгоритмы и структуры данных.md',
        title: 'Алгоритмы и структуры данных',
        type: 'course',
        author: 'Stepik',
        url: 'https://stepik.org/course/217',
        areaName: 'Учёба',
      },
    });
  });

  it('конспект и обычная заметка не импортируются, шаблоны пропускаются', () => {
    expect(parseVaultFile(vaultFile('Конспекты/Алгоритмы — лекция 4. Графы.md'))).toEqual({ kind: 'skip', reason: 'not-review' });
    expect(parseVaultFile(vaultFile('Заметки/Мысли о расписании.md'))).toEqual({ kind: 'skip', reason: 'not-review' });
    for (const name of ['Заметка', 'Конспект', 'Материал']) {
      expect(parseVaultFile(vaultFile(`Шаблоны/${name}.md`))).toEqual({ kind: 'skip', reason: 'template' });
    }
  });

  // Демо-аккаунт на сервере (manage.py demo) берёт заметки и материалы из этого разбора: так они совпадают
  // с хранилищем, и первая синхронизация ничего не меняет. После правки хранилища: npx vitest run -u.
  it('разбор для демо-аккаунта сохранён в backend/tracker/demo/vault.json', async () => {
    const files = Object.entries(exampleVault)
      .map(([key, content]) => ({ path: key.slice(key.indexOf('example-vault/') + 'example-vault/'.length), content }))
      .sort((a, b) => (a.path < b.path ? -1 : 1));
    const vault = parseVault('example-vault', files);
    await expect(`${JSON.stringify(vault, null, 2)}\n`).toMatchFileSnapshot('../../../backend/tracker/demo/vault.json');
  });
});

describe('свойства', () => {
  it('читает YAML и отделяет текст', () => {
    const doc = splitFrontmatter('---\ntags: [a, b]\nreview: true\n---\nТекст');
    expect(doc.frontmatter).toEqual({ tags: ['a', 'b'], review: true });
    expect(doc.body).toBe('Текст');
  });

  it('без свойств и со сломанным YAML', () => {
    expect(splitFrontmatter('Просто текст').frontmatter).toEqual({});
    const broken = splitFrontmatter('---\ntags: [a\n---\nТекст');
    expect(broken.frontmatterError).toBe(true);
    expect(broken.body).toBe('Текст');
  });

  it('понимает переносы строк Windows', () => {
    expect(splitFrontmatter('---\r\nreview: true\r\n---\r\nТекст').frontmatter).toEqual({ review: true });
  });

  it('свойство review: true без тега', () => {
    const note = asNote(parseVaultFile({ path: 'x.md', content: '---\nreview: true\n---\n## Вопросы\n- Почему?' }));
    expect(note.questions).toEqual(['Почему?']);
  });
});

describe('теги', () => {
  it('из свойств и из текста, без кода, якорей и чисел', () => {
    const body = 'Тег #review и #english/grammar.\nЗаголовок:\n# Не тег\n`#code` и ссылка https://x.com/#anchor и #123';
    expect(extractTags({ tags: ['Учёба'] }, body).sort()).toEqual(['english/grammar', 'review', 'учёба']);
  });

  it('тег в начале строки и в строке свойств через запятую', () => {
    expect(extractTags({ tags: 'a, #b' }, '#review')).toEqual(['a', 'b', 'review']);
  });
});

describe('вопросы', () => {
  it('только верхний уровень списка, чекбоксы и ссылки очищаются', () => {
    const content = '- [ ] Что такое [[Хеш-таблица|хеш-таблица]]?\n  - подсказка\n- **Почему** O(1)?\n\n- ';
    expect(listItems(content)).toEqual(['Что такое хеш-таблица?', 'Почему O(1)?']);
  });

  it('выноски question и faq, текст на следующей строке', () => {
    const body = '> [!question]- Свёрнутый вопрос?\n\n> [!FAQ]\n> Вопрос\n> в две строки?\n\n> [!note] Не вопрос';
    expect(calloutQuestions(body)).toEqual(['Свёрнутый вопрос?', 'Вопрос в две строки?']);
  });

  it('раздел «Вопросы» с двоеточием и эмодзи, подсказки в %% %% не считаются', () => {
    const note = asNote(
      parseVaultFile({ path: 'x.md', content: '#review\n## ❓ Вопросы:\n%% - подсказка %%\n- Первый?\n## Связи\n- [[Другое]]' }),
    );
    expect(note.questions).toEqual(['Первый?']);
  });
});

describe('ссылки', () => {
  it('цель ссылки из свойства', () => {
    expect(linkTarget('[[Книги/English Grammar in Use|Murphy]]')).toBe('English Grammar in Use');
    expect(linkTarget('[[Алгоритмы#Графы]]')).toBe('Алгоритмы');
    expect(linkTarget('Просто название')).toBe('Просто название');
    expect(linkTarget('[[]]')).toBeNull();
    expect(linkTarget(['[[Первая]]', '[[Вторая]]'])).toBe('Первая');
    expect(linkTarget(null)).toBeNull();
  });

  it('ссылка obsidian:// кодирует пробелы и кириллицу', () => {
    expect(obsidianUri('Мой вольт', 'Заметки/Двоичный поиск.md')).toBe(
      'obsidian://open?vault=%D0%9C%D0%BE%D0%B9%20%D0%B2%D0%BE%D0%BB%D1%8C%D1%82&file=%D0%97%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B8%2F%D0%94%D0%B2%D0%BE%D0%B8%D1%87%D0%BD%D1%8B%D0%B9%20%D0%BF%D0%BE%D0%B8%D1%81%D0%BA',
    );
  });
});
