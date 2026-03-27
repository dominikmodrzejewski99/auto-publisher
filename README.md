# Blog Auto-Publisher

Automatyczny pipeline do generowania artykułów na bloga podróżniczego, publikowania na Bloggerze i promowania na Facebooku.

## Jak to działa

1. Pobiera aktualne trendy z Google Trends
2. AI generuje tematy artykułów dopasowane do trendów
3. AI pisze pełne artykuły w HTML (po polsku)
4. Pobiera zdjęcia z Unsplash
5. Składa artykuł z szablonem, spisem treści i zdjęciami
6. Publikuje na Bloggerze
7. Generuje i planuje post na Facebooku
8. Codziennie o 8:00 via GitHub Actions

## Szybki start

```bash
npm install
cp .env.example .env
# uzupełnij klucze w .env (instrukcja poniżej)
npm run start:dry   # testowy przebieg bez publikowania
npm start           # pełny przebieg z publikacją
```

## Skąd wziąć klucze API

### 1. OPENROUTER_API_KEY

Darmowy model AI (Gemini Flash) do generowania artykułów i postów FB.

1. Zarejestruj się na https://openrouter.ai/
2. Przejdź do https://openrouter.ai/keys
3. Kliknij **Create Key**
4. Skopiuj klucz do `.env`

> Darmowy model `google/gemini-2.0-flash-exp:free` nie wymaga dodawania karty.

### 2. UNSPLASH_ACCESS_KEY

Zdjęcia do artykułów (50 req/h na darmowym planie).

1. Zarejestruj się na https://unsplash.com/developers
2. Kliknij **Your apps** → **New Application**
3. Zaakceptuj warunki, nadaj nazwę (np. "Blog Auto-Publisher")
4. Skopiuj **Access Key** do `.env`

### 3. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN

Dostęp do Blogger API przez OAuth2.

**Krok A — Utwórz projekt Google Cloud:**

1. Przejdź do https://console.cloud.google.com/
2. Utwórz nowy projekt (np. "Blog Publisher")
3. Włącz **Blogger API v3**: https://console.cloud.google.com/apis/library/blogger.googleapis.com
4. Przejdź do **APIs & Services → Credentials**
5. Kliknij **Create Credentials → OAuth client ID**
6. Typ: **Web application**
7. Dodaj Authorized redirect URI: `http://localhost:3000`
8. Skopiuj **Client ID** i **Client Secret** do `.env`

**Krok B — Uzyskaj Refresh Token:**

```bash
npm run auth:google
```

Skrypt otworzy przeglądarkę z ekranem autoryzacji Google. Zaloguj się kontem, które jest właścicielem bloga, i zatwierdź dostęp. Token zostanie przechwycony automatycznie i wyświetlony w terminalu.

### 4. BLOGGER_BLOG_ID

ID Twojego bloga na Bloggerze.

1. Otwórz https://www.blogger.com/
2. Wybierz swojego bloga
3. ID jest w URL: `https://www.blogger.com/blog/posts/TUTAJ_JEST_ID`
4. Skopiuj do `.env`

### 5. FB_APP_ID, FB_APP_SECRET

Aplikacja Facebook do publikowania postów.

1. Przejdź do https://developers.facebook.com/apps/
2. Kliknij **Create App** → typ **Business**
3. Nadaj nazwę (np. "Blog Publisher")
4. W ustawieniach aplikacji: **Settings → Basic**
5. Skopiuj **App ID** i **App Secret** do `.env`
6. Dodaj produkt **Facebook Login for Business**

### 6. FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID

Token dostępu do fanpage'a (ważny ~60 dni).

```bash
npm run auth:fb-refresh
```

Skrypt przeprowadzi Cię przez proces:
1. Wejdź na https://developers.facebook.com/tools/explorer/
2. Wybierz swoją aplikację
3. Kliknij **Get User Access Token**
4. Zaznacz uprawnienia: `pages_manage_posts`, `pages_read_engagement`
5. Wklej krótkotrwały token w terminalu
6. Skrypt wymieni go na długotrwały i wyświetli `FB_PAGE_ID` + `FB_PAGE_ACCESS_TOKEN`

> Token wygasa po ~60 dniach. Pipeline ostrzeże Cię 7 dni przed wygaśnięciem. Uruchom `npm run auth:fb-refresh` ponownie, żeby odnowić.

## GitHub Actions

Pipeline uruchamia się codziennie o 6:00 UTC (8:00 PL). Aby skonfigurować:

1. Wypchnij repo na GitHub
2. Przejdź do **Settings → Secrets and variables → Actions**
3. Dodaj każdy klucz z `.env` jako **Repository secret** (te same nazwy)
4. Pipeline ruszy automatycznie następnego dnia lub uruchom ręcznie: **Actions → Publish Articles → Run workflow**

## Komendy

| Komenda | Opis |
|---------|------|
| `npm start` | Pełny pipeline (publikuje na żywo) |
| `npm run start:dry` | Testowy przebieg bez publikowania |
| `npm test` | Uruchom testy |
| `npm run auth:google` | Uzyskaj Google Refresh Token |
| `npm run auth:fb-refresh` | Odnów Facebook Page Token |

## Struktura projektu

```
src/
  index.ts              # Orkiestrator pipeline
  config.ts             # Konfiguracja z .env
  types.ts              # Typy TypeScript
  ai/openrouter.ts      # Klient OpenRouter API
  trends/trend-fetcher.ts   # Google Trends
  topics/topic-generator.ts # Generowanie tematów AI
  articles/
    article-generator.ts    # Generowanie artykułów AI
    template.ts             # Szablon HTML ze stylami
  images/image-fetcher.ts   # Unsplash API
  publisher/blogger.ts      # Blogger API
  social/facebook.ts        # Facebook Graph API
  scripts/
    google-auth.ts          # Helper: Google OAuth2
    fb-token-refresh.ts     # Helper: FB token refresh
data/
  categories.json       # Kategorie bloga
  published.json        # Log opublikowanych artykułów
prompts/                # Prompty systemowe dla AI
.github/workflows/      # GitHub Actions cron
```
