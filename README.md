# molitva-bot

Telegram-бот портфолио: меню со ссылками, квиз «Оценить проект» и пост-проводник в канал.

Без npm-зависимостей. Node 24+, long polling через `fetch` к Bot API.

## Что делает

- `/start` — короткое приветствие и inline-меню: портфолио, кейсы, оценка, канал, написать
- «Оценить проект» — 4 шага на кнопках (тип задачи, ниша, есть ли сайт/CRM, сроки), вилка цены/срока из `config.js`, кнопка «Отправить заявку» → сообщение админу
- Deep link `?start=quiz` сразу открывает квиз
- `/post` только для `ADMIN_ID` — публикует `posts/navigator.md` (HTML) в `CHANNEL_ID` с кнопками-ссылками

Состояние квиза живёт в памяти процесса (`Map`). БД нет.

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
| `ADMIN_ID` | Числовой Telegram id — заявки и `/post` |
| `CHANNEL_ID` | Куда слать пост: `@channel` или `-100…` |

## Конфиг

- `config.js` — ссылки, шаги квиза, плейсхолдеры цены и срока
- `posts/navigator.md` — текст поста-проводника (`parse_mode: HTML`)

## Стек

Node.js 24 · Telegram Bot API · zero npm dependencies
