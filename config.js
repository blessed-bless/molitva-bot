// Ссылки, шаги квиза и вилка цены/срока.

export const links = {
  portfolio: 'https://dubstepmolitva.ru/',
  cases: 'https://dubstepmolitva.ru/work/',
  smena: 'https://dubstepmolitva.ru/work/smena/',
  channel: 'https://t.me/molitva_deploy',
  write: 'https://t.me/ketasonx',
  github: 'https://github.com/blessed-bless',
};

export const quizSteps = [
  {
    key: 'need',
    ask: 'Что нужно сделать?',
    options: [
      ['site', 'Сайт'],
      ['bot', 'Бот'],
      ['booking', 'Онлайн-запись'],
      ['auto', 'Автоматизация'],
    ],
  },
  {
    key: 'niche',
    ask: 'Ниша?',
    options: [
      ['barber', 'Барбершоп / салон'],
      ['auto', 'Автосервис'],
      ['services', 'Услуги'],
      ['other', 'Другое'],
    ],
  },
  {
    key: 'crm',
    ask: 'Сайт или CRM уже есть?',
    options: [
      ['yes', 'Да'],
      ['no', 'Нет'],
    ],
  },
  {
    key: 'timing',
    ask: 'Сроки?',
    options: [
      ['asap', 'Срочно'],
      ['month', 'В течение месяца'],
      ['later', 'Не спешу'],
    ],
  },
];

export const prices = {
  site: {min: 30000, max: 70000},
  bot: {min: 25000, max: 50000},
  booking: {min: 50000, max: 90000},
  auto: {min: 20000, max: 50000},
};

export const weeks = {
  site: {min: 2, max: 4},
  bot: {min: 1, max: 3},
  booking: {min: 2, max: 4},
  auto: {min: 1, max: 3},
};

export const urgencyMultiplier = 1.3;

const HOSTING_NOTE =
  'Хостинг, домен и платные сервисы (YCLIENTS, эквайринг) оплачиваются отдельно.';

export function formatRub(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function roundThousand(n) {
  return Math.round(n / 1000) * 1000;
}

function weekWord(n) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'неделя';
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'недели';
  return 'недель';
}

export function quoteFor(answers) {
  const need = prices[answers.need] ? answers.need : 'site';
  const base = prices[need];
  const span = weeks[need];
  const urgent = answers.timing === 'asap';

  let min = base.min;
  let max = base.max;
  if (urgent) {
    min = roundThousand(min * urgencyMultiplier);
    max = roundThousand(max * urgencyMultiplier);
  }

  const termText = urgent
    ? `срок ${span.min} ${weekWord(span.min)}`
    : `срок ${span.min}–${span.max} ${weekWord(span.max)}`;

  const urgencyMark = urgent ? ' (срочность +30%)' : '';
  const line =
    `Ориентир: от ${formatRub(min)} ₽, обычно ${formatRub(min)}–${formatRub(max)} ₽, ${termText}${urgencyMark}. ` +
    'Точную смету скажу после короткого разбора.';

  return {
    min,
    max,
    urgent,
    term: termText,
    line,
    hosting: HOSTING_NOTE,
    price: `от ${formatRub(min)} ₽ (${formatRub(min)}–${formatRub(max)} ₽)`,
    note: urgent ? 'срочность +30%' : '',
  };
}

export function optionLabel(stepKey, value) {
  const step = quizSteps.find((s) => s.key === stepKey);
  const hit = step?.options.find(([id]) => id === value);
  return hit ? hit[1] : value;
}
