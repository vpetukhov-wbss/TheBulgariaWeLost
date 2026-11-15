# The Bulgaria We Lost · Angular

Чист Angular workspace за архива с Nebular 17.0.0, Eva Icons и стандартната светла тема `default`. Компонентите на Nebular се импортират във функционалностите, които ги използват. Основата включва начален изглед, профил, работен панел за проверка на достъпа и формите за акаунта.

## Локално стартиране

Нужен е Node.js 22.12+ от серия 22 или Node.js 24. Изпълни от `apps/web`:

```sh
npm ci
npm start
```

Angular слуша на `http://localhost:4200`. Локалният proxy насочва `/api/**` към NestJS на `http://localhost:3000`. За мейлите на Brocoders задай `FRONTEND_DOMAIN=http://localhost:4200`. При публикуване обслужвай Angular и API от един origin, насочи `/api/` към NestJS и настрой SPA fallback към `index.html` за браузърните маршрути.

```sh
npm run format:check
npm run typecheck
npm run build
```

Готовият браузърен build се намира в `dist/bulgaria-web/browser`.

## Сесии и роли

- `NbAuthService` използва `NbPasswordAuthStrategy` с маршрутите на Brocoders под `/api/v1/auth/`. Вградените JWT модел и interceptor поставят access token само в подходящите API заявки. Адаптерът подава refresh token като `Authorization: Bearer` към `POST /api/v1/auth/refresh`. Паралелните заявки споделят един refresh, тъй като Brocoders ротира токена.
- Токените се пазят в паметта на текущия таб. Презареждане на страницата или отваряне на друг таб изисква вход. За трайна сесия е необходим отделен договор с NestJS за `HttpOnly` cookie и CSRF защита.
- `NbSecurityModule` управлява видимостта на навигацията за `Guest`, `User`, `Editor` и `Administrator`. JWT claim `role` може да е име или обект с `name`. Стандартните числови роли на Brocoders нямат редакторски или административен достъп в Angular.
- `/admin` използва проектния договор `GET /api/admin/v1/me` за актуална роля, разрешения и потвърдена администраторска MFA сесия. NestJS проверява достъпа при всяка защитена заявка. Работните екрани и MFA потвърждението се интегрират с реализацията на административния API.

## Зависимости

Angular 21.2 и Nebular 17.0.0 са фиксирани в манифеста и lockfile. Angular CDK е фиксиран на 21.0.6, защото публикуваният Nebular 17 използва вътрешен CDK export, премахнат в 21.1. [Дискусия в Akveo](https://github.com/akveo/nebular/issues/3310)
