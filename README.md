# molitva-bot

Telegram-бот портфолио: меню со ссылками, квиз «Оценить проект» и посты в канал.

Без npm-зависимостей. Node 24+, long polling через `fetch` к Bot API.

## Что делает

- `/start` — короткое приветствие и inline-меню: портфолио, кейсы, оценка, канал, написать
- «Оценить проект» — 4 шага на кнопках (тип задачи, ниша, есть ли сайт/CRM, сроки), вилка цены/срока из `config.js`, кнопка «Отправить заявку» → сообщение админу
- Deep link `?start=quiz` сразу открывает квиз
- `/post` только для `ADMIN_ID` — публикует `posts/navigator.md` (HTML) в `CHANNEL_ID` с кнопками-ссылками
- `/intro preview` — превью первого поста с картинкой админу; `/intro` — в `CHANNEL_ID` (`assets/intro.png` + `posts/intro.md`)
- `/post2 preview` / `/post2` — пост про цены (`assets/pricing.png` + `posts/pricing.md`)

Состояние квиза живёт в памяти процесса (`Map`). БД нет.

## Отложенные посты

Файлы `posts/*.md` с YAML frontmatter:

```md
---
at: 2026-11-24 12:00
image: posts/img/gran.jpg
buttons:
  - [Открыть сайт, https://example.com]
  - [Хочу так же, https://t.me/<бот>?start=quiz]
---
Текст поста (HTML).
```

- `at` — время Омска (UTC+6), формат `YYYY-MM-DD HH:mm`
- `image` — опционально; если файла нет, уйдёт текстом
- `buttons` — url-кнопки; `<бот>` подставляется в username бота
- если текст длиннее 1024 и есть фото — уходит `sendMessage` без фото

Команды (только админ):

| Команда | Действие |
| --- | --- |
| `/schedule` | Сканирует `posts/`, кладёт будущие посты в `data/schedule.json` |
| `/queue` | Показывает очередь |
| `/unschedule 03-gran.md` | Снимает с очереди (не удаляет файл) |
| `/preview 03-gran.md` | Шлёт пост админу в личку |
| `/postnow 03-gran.md` | Сразу в `CHANNEL_ID` после «Опубликовать / Отмена»; помечает posted в очереди |

Таймер раз в 30 с публикует due-посты. Опоздание больше 6 часов — пропуск + уведомление админу.

`DRY_CHANNEL` — куда слать отложенные вместо `CHANNEL_ID` (обычно свой `ADMIN_ID`). Ручные `/post`, `/intro`, `/post2`, `/postnow` всегда идут в `CHANNEL_ID`.

Заготовки: `posts/03-gran.md`, `04-152fz.md`, `05-speed.md` — текст можно дописать.

## Запуск

```bash
cp .env.example .env
# BOT_TOKEN, ADMIN_ID, CHANNEL_ID
npm start
```

Проверка логики без Telegram:

```bash
npm test
```

## Переменные окружения

| Переменная | Назначение |
| --- | --- |
| `BOT_TOKEN` | Токен от @BotFather |
| `ADMIN_ID` | Числовой Telegram id — заявки и админ-команды |
| `CHANNEL_ID` | Куда слать обычные посты: `@channel` или `-100…` |
| `DRY_CHANNEL` | Опционально: цель для отложенных постов (обычно = `ADMIN_ID`) |

## Конфиг

- `config.js` — ссылки, шаги квиза, вилка цены и срока
- `schedule.js` — frontmatter, очередь, таймер публикации
- `posts/navigator.md` — текст поста-проводника (`parse_mode: HTML`)
- `posts/intro.md` — подпись к первому посту
- `assets/intro-source.jpg` → `assets/intro.png` — обложка intro (`npm run render:intro`)
- `assets/pricing.svg` → `assets/pricing.png` — обложка цен (`npm run render:pricing`, нужен `sharp`)

## Стек

Node.js 24 · Telegram Bot API · zero runtime npm dependencies
