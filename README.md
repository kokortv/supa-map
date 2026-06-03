# Supa Map

Статическое веб-приложение для заявок о свалках. Авторизация идет через Google OAuth, строки пишутся в Google Sheets, фото загружаются в Google Drive.

## Запуск

```bash
python3 -m http.server 8080
```

Откройте `http://localhost:8080` из папки `outputs/trash-map-app`.

## Настройка Google

1. В Google Cloud Console создайте OAuth Client ID типа Web application.
2. Добавьте authorized JavaScript origin: `http://localhost:8080`.
3. В `app.js` укажите OAuth Client ID в `APP_GOOGLE_CLIENT_ID` или сохраните его один раз в настройках.
4. Первичный администратор уже задан как `kirill.kokorin@gmail.com`.
5. Откройте приложение, раздел `Настройки`, вставьте:
   - OAuth Client ID;
   - email дополнительных администраторов через запятую, если они нужны.
6. Войдите под email администратора. Если `Sheet ID` и `Drive Folder ID` пустые, приложение создаст таблицу и папку автоматически.
7. Кнопка `Создать хранилище` в настройках вручную создает недостающую таблицу, папку и лист `Dumps`.

## Статусы

- Новая заявка получает статус `pending`.
- Email автора сразу записывается в `confirmations`.
- Когда второй уникальный пользователь нажимает `Подтвердить`, статус меняется на `confirmed`.
- Администратор может вручную подтвердить, отклонить с пояснением или удалить строку из таблицы.

## Схема листа Dumps

`id`, `createdAt`, `updatedAt`, `status`, `lat`, `lng`, `type`, `size`, `description`, `photoFileId`, `photoUrl`, `createdByEmail`, `createdByName`, `confirmations`, `adminNote`
