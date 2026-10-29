# Kafka UI

Простое веб-приложение для работы с Apache Kafka: просмотр брокеров и топиков, отправка сообщений.

**Стек:** FastAPI (Python) + React (TypeScript) + confluent-kafka

## Возможности

- Подключение к Kafka по адресу `bootstrap.servers` (например `localhost:9092`)
- Опциональные настройки: SSL/TLS, SASL (PLAIN, SCRAM-SHA-256/512)
- Просмотр списка брокеров кластера
- Просмотр топиков и метаданных партиций
- Просмотр сообщений в топике
- Отправка сообщений в топик (key, value, partition)
- Просмотр consumer groups для топика (offset, lag, участники)

## Desktop-приложение (как Postman)

Готовое окно Windows: без Docker, без ручного `uvicorn`/`npm`. Подключается к **уже доступному** Kafka (локальному или удалённому).

**Требования:** Python 3.11+, Node.js (только для сборки), [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (обычно уже есть на Windows 10/11).

### Запуск без .exe (разработка desktop)

```bash
# 1. Собрать UI
cd frontend
npm install
npm run build
# скопировать dist → desktop/ui
cd ..
powershell -Command "Copy-Item -Recurse -Force frontend/dist desktop/ui"

# 2. Зависимости и окно
cd desktop
pip install -r requirements.txt
python run.py
```

### Сборка .exe

Из корня репозитория:

```powershell
powershell -ExecutionPolicy Bypass -File desktop/build.ps1
```

Результат: `desktop/dist/KafkaUI/KafkaUI.exe` — запускайте **именно этот файл из папки `KafkaUI`** (рядом должна быть `_internal`). Не копируйте только `.exe` отдельно.

Если окно не видно: проверьте панель задач и лог `%LOCALAPPDATA%\KafkaUI\kafkaui.log`. При ошибке появится MessageBox.

**Раздача друзьям:** отправляйте всю папку `KafkaUI` (с `_internal`). Распаковывайте в путь **без кириллицы**, например `C:\Tools\KafkaUI`.

Если у получателя ошибка `Python.Runtime.dll`:
1. ПКМ по папке/`KafkaUI.exe` → Свойства → **Разблокировать** (или `Get-ChildItem -Recurse | Unblock-File`)
2. Установить [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
3. Установить [VC++ Redistributable x64](https://aka.ms/vs/17/release/vc_redist.x64.exe)

В новой сборке при сбое окна приложение откроется в браузере.
Kafka в бандл **не** входит: укажите bootstrap-адрес существующего брокера (например `localhost:9092`).

Dev-сценарий ниже (Docker + hot reload) по-прежнему работает отдельно.

## Быстрый старт

### Вариант A — всё через Docker (без установки Node.js)

```bash
# 1. Kafka
docker compose up -d

# 2. Backend (на хосте, в отдельном терминале)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Frontend (в Docker, npm на компьютере не нужен)
docker compose --profile ui up frontend
```

UI: http://localhost:5173

### Вариант B — с Node.js на компьютере

Установите [Node.js LTS](https://nodejs.org/) (вместе с ним появится `npm`), перезапустите PowerShell, затем:

```bash
# 1. Kafka
docker compose up -d

# 2. Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd frontend
npm install
npm run dev
```

UI: http://localhost:5173

API: http://localhost:8000/docs

## Устранение неполадок

### `npm` не распознан / Node.js не установлен

Используйте **Вариант A** выше (`docker compose --profile ui up frontend`) — Node.js на компьютере не нужен.

Либо установите Node.js LTS с https://nodejs.org и **перезапустите PowerShell**.

### `WinError 10013` при запуске backend на порту 8000

Порт уже занят другим процессом (часто — предыдущим запуском uvicorn).

```powershell
# Найти процесс на порту 8000
netstat -ano | findstr ":8000"

# Завершить процесс (замените PID)
taskkill /PID <PID> /F
```

Либо запустите backend на другом порту:

```bash
uvicorn app.main:app --reload --port 8001
```

Если используете другой порт, обновите proxy в `frontend/vite.config.ts`.

### Docker: `dockerDesktopLinuxEngine` not found

Запустите **Docker Desktop** и дождитесь статуса «Running», затем снова выполните `docker compose up -d`.

### Kafka-контейнер сразу останавливается

Проверьте логи:

```bash
docker logs kafkaui-kafka
```

Пересоздайте контейнер:

```bash
docker compose down
docker compose up -d
```

## Использование

1. Введите адрес Kafka (`localhost:9092`) и нажмите **Проверить** или **Подключиться**
2. При необходимости раскройте **Дополнительные настройки** для SSL/SASL
3. После подключения отобразятся брокеры и топики
4. Выберите топик и отправьте сообщение в блоке **Отправить сообщение**

## API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/connections/test` | Проверить подключение |
| POST | `/api/connections` | Создать подключение |
| GET | `/api/connections/{id}/brokers` | Список брокеров |
| GET | `/api/connections/{id}/topics` | Список топиков |
| GET | `/api/connections/{id}/topics/{name}/messages` | Сообщения топика |
| GET | `/api/connections/{id}/topics/{name}/consumers` | Consumer groups топика |
| POST | `/api/connections/{id}/produce` | Отправить сообщение |
| DELETE | `/api/connections/{id}` | Отключиться |

## Структура проекта

```
kafkaui/
├── backend/          # FastAPI + confluent-kafka
├── frontend/         # React + Vite
├── desktop/          # pywebview + PyInstaller (Windows app)
├── docker-compose.yml
└── README.md
```

## Подключение к защищённому Kafka

| Параметр | Описание |
|----------|----------|
| `security.protocol` | `PLAINTEXT`, `SSL`, `SASL_PLAINTEXT`, `SASL_SSL` |
| `sasl.mechanism` | `PLAIN`, `SCRAM-SHA-256`, `SCRAM-SHA-512` |
| `sasl.username` / `sasl.password` | Учётные данные SASL |
| SSL CA (PEM) | Текст CA-сертификата для проверки TLS |
