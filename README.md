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
3. В `config.js` укажите OAuth Client ID, Sheet ID, Drive Folder ID и первичных администраторов.
4. Войдите под email администратора.
5. В разделе `Настройки` можно добавить email дополнительных администраторов.
6. Кнопка `Создать хранилище` в настройках вручную создает недостающую таблицу, папку и лист `Dumps`, если ID не заданы в `config.js`.

## Статусы

- Новая заявка получает статус `pending`.
- Email автора сразу записывается в `confirmations`.
- Когда второй уникальный пользователь нажимает `Подтвердить`, статус меняется на `confirmed`.
- Администратор может вручную подтвердить, отклонить с пояснением или удалить строку из таблицы.

## Схема листа Dumps

`id`, `createdAt`, `updatedAt`, `status`, `lat`, `lng`, `type`, `size`, `description`, `photoFileId`, `photoUrl`, `createdByEmail`, `createdByName`, `confirmations`, `adminNote`
