# CLAUDE.md — AWS SAA-C03 Trainer (RU)

Личный офлайн-тренажёр к экзамену **AWS Certified Solutions Architect – Associate (SAA-C03)**.
Статический сайт: vanilla JS (ES modules), без сборки и зависимостей; весь контент — JSON в `content/`.
Прогресс хранится в `localStorage` браузера.

## Язык контента
- Весь пользовательский текст — **на русском**, **термины AWS — на английском**: названия сервисов и фич
  (S3, Multi-AZ, Read Replica, Transfer Acceleration, Savings Plans…), ресурсы (bucket, instance, subnet,
  Security Group, IAM role), экзаменационные маркеры (LEAST operational overhead, MOST cost-effective).
- Код, CLI, Pulumi, `id`, `url`, ключи JSON не переводятся.
- "(Choose two)" → "(Выберите два)".

## Запуск и проверки
```bash
node serve.js                        # http://localhost:8000
node --test                          # unit-тесты (quiz, storage, hub-lib)
node scripts/build-hub.mjs           # пересобрать content/hub/index.json (после любой правки хаба/вопросов)
node scripts/validate-content.mjs    # валидация всего контента, включая карты и свежесть index.json
node scripts/list-services.mjs [str] # словарь service id карты №1 (с фильтром)
```
**После любого изменения контента:** `node scripts/build-hub.mjs && node scripts/validate-content.mjs && node --test`.
Тексты вопросов в топиках/экзаменах тоже попадают в `index.json` — правка вопроса ⇒ пересборка хаба.

## Структура
```
index.html, css/styles.css, serve.js
js/app.js        hash-роутер: #/  #/topic/<slug>  #/exams  #/exam/<n>  #/services[/<id>][?q=&view=sheet]  #/hub[/<doc-id>][?q=&s=&topic=&src=]
js/views.js      дашборд, страницы тем, список экзаменов
js/exam.js       экзамен на время + разбор;  js/quiz.js — проверка ответов и рендер вопроса
js/maps.js       Карта №1 (mind map + шпаргалка) и Карта №2 (граф хаба с подсветкой)
js/content.js    загрузка JSON (manifest, topics, exams, services, hub index)
content/manifest.json      темы, экзамены, домены, пути карт
content/topics/<slug>.json essentials (+diagram, links), labs (cli/pulumi), questions (практика)
content/exams/exam-N.json  65 вопросов, 130 мин
content/diagrams/*.svg     офлайн-диаграммы (подписи на русском)
content/maps/services.json КАРТА №1 — источник истины по сервисам (категории → сервисы → шпаргалка)
content/hub/docs/<id>.json КАРТА №2 — один документ = один вопрос (карточка знаний)
content/hub/index.json     ГЕНЕРИРУЕТСЯ build-hub.mjs — не редактировать руками
scripts/hub-lib.mjs        checkDoc / similarity / buildIndex (чистые функции, покрыты тестами)
scripts/build-hub.mjs      сборка index.json (--check — только проверка свежести)
scripts/validate-content.mjs, scripts/list-services.mjs, scripts/debias-answers.mjs
tests/*.test.mjs
```

## Карта №1 — сервисы (`content/maps/services.json`)
`categories[] → { id, name, summary, services[] }`, сервис:
```json
{ "id": "sqs", "name": "Amazon SQS", "tagline": "что это, ≤80 символов",
  "facts": ["3–6 экзаменационных фактов/лимитов"], "use_when": ["2–4 триггера «выбирай, когда…»"],
  "not_for": ["0–3 ловушки"], "vs": [{ "id": "sns", "note": "чем отличается, ≤100 символов" }],
  "keywords": ["4–10: англ. термины + рус. сигнальные фразы"], "doc": "https://docs.aws.amazon.com/..." }
```
- `id` — стабильный kebab-case, **никогда не переименовывать** (на них ссылаются документы хаба).
- `vs[].id` должен существовать. Концепции (dr-strategies, rto-rpo, decoupling, encryption…) — тоже «сервисы» в категории `concepts`.
- В UI: радиальный mind map (зум колесом, перетаскивание), поиск подсвечивает совпадения, клик — карточка
  со ссылкой «Вопросы в хабе: N»; вкладка «Шпаргалка» — карточки по категориям (печатается).

## Карта №2 — хаб вопросов (`content/hub/docs/*.json`)
Каждый вопрос — документ-карточка. Для вопросов из topics/exams текст вопроса **не копируется** —
`build-hub.mjs` подтягивает stem/options/answer/explanation по `id` из источника.
```json
{
  "id": "sto-q1",
  "source": { "type": "topic", "ref": "storage" },
  "concept": "S3 Lifecycle: каскад storage classes под паттерн доступа",
  "tests": "Что именно проверяет вопрос (1–2 предложения).",
  "expected": "Ожидаемый ответ своими словами + триггеры в условии, по которым его узнать.",
  "why_not": "Почему неверны основные distractors.",
  "keywords": ["lifecycle", "Glacier Deep Archive", "compliance", "12 часов"],
  "services": ["s3-lifecycle", "s3-storage-classes", "glacier"],
  "topics": ["storage", "cost"],
  "domain": 4,
  "related": []
}
```
- `concept` — стиль «Сервис/область: суть», ≤ 90 символов. **Переиспользуй дословно** уже существующую
  формулировку, если понятие то же самое (их группирует UI: «Понятия, которые встречаются чаще всего»).
  Проверить существующие: `node -e 'console.log(Object.keys(require("./content/hub/index.json").byConcept).join("\n"))' | grep -i <слово>`.
- `services` — 1–5 id из карты №1, первым — главный сервис (он же «якорь» узла на графе).
- `topics` — slug-и из manifest (1–3). `domain` 1–4 (Secure / Resilient / High-Performing / Cost-Optimized).
- `related` — необязательные ручные связи (id других документов); автоматические связи (до 6)
  считаются в `buildIndex` по общим сервисам, concept, keywords, topics.
- UI: граф «вопросы ↔ сервисы»; поиск/чип по ключевому слову подсвечивает совпадающие вопросы
  (keywords/concept — сильные совпадения, упоминание в тексте — слабые), их сервисы и связанные вопросы;
  клик по вопросу — карточка (вопрос с самопроверкой, понятие, ожидаемый ответ, связи), клик по сервису — фильтр.

## Рабочий процесс: пользователь присылает новый вопрос
Андрей по ходу подготовки присылает вопросы (текст, скриншот, иногда на английском). Для каждого:
1. **Дубли:** поиск по ключевым фразам в `content/hub/docs/` и `index.json`. Если такой вопрос уже есть —
   сообщить и не создавать копию (можно дополнить `keywords`/`related` существующего).
2. **Документ** `content/hub/docs/u-YYYYMMDD-<короткий-slug>.json` (дата — день добавления):
   ```json
   {
     "id": "u-20260927-s3-object-lock",
     "source": { "type": "user", "added": "2026-09-27", "origin": "откуда вопрос, если сказано" },
     "question": {
       "stem": "Текст вопроса на русском (термины AWS на английском)",
       "options": ["...", "..."],
       "answer": 1,
       "explanation": "Почему верный ответ верен и почему остальные нет",
       "original": "Оригинальный английский текст вопроса и вариантов, если прислан на английском"
     },
     "concept": "...", "tests": "...", "expected": "...", "why_not": "...",
     "keywords": [], "services": [], "topics": [], "domain": 1, "related": []
   }
   ```
   `answer` — 0-based индекс или массив для multi-select. Если пользователь не указал правильный ответ —
   определить самому и явно сказать об этом в ответе; если вопрос спорный — пометить это в `explanation`.
3. **Обогатить карту №1**, если нужно: новый сервис → добавить в подходящую категорию со всеми полями
   (новый стабильный `id`); новый экзаменационный факт/ловушка/пара «vs» → дописать в существующий сервис
   (кратко, без дублей). Не удалять и не переименовывать существующие `id`.
4. `node scripts/build-hub.mjs && node scripts/validate-content.mjs && node --test`.
5. Ответить кратко: что добавлено (id документа, concept), что изменено в карте сервисов, с какими
   вопросами связался (топ related из index.json).

## Правила изменений
- Порядок `options` в существующих вопросах не менять (на `answer` завязан прогресс/разбор).
- `content/hub/index.json` не править руками — только через `build-hub.mjs`.
- Существующие id (вопросов, сервисов, лаб) не переименовывать: на них ссылаются прогресс в localStorage и хаб.
- Новые диаграммы — офлайн-SVG в `content/diagrams/`, подписи на русском, тёмный фон (#0f1b2d).
- Вопросы — оригинальные, в стиле SAA-C03; это не реальные вопросы экзамена.
