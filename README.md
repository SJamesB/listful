# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Distribution

- **Web**: pushes to `master` automatically build the static web export (`npx expo export -p web`) and deploy it to GitHub Pages via [`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml). The site is served from `https://<owner>.github.io/listful/`, so the build sets `EXPO_BASE_URL=/listful` (see `app.config.js`) — this only affects the web export; native builds and local `expo start` are unaffected. One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
- **Installable web app (PWA)**: the web build is a Progressive Web App. Open `https://sjamesb.github.io/listful/` on the phone and use **Install app** (Chrome) or **Share → Add to Home Screen** (Safari). After that, merging to `master` is the whole release: the app loads the newest deploy on every launch and picks up a new version when it is brought back to the foreground. `npm run build:web` runs the export and then `scripts/generate-sw.js`, which writes the service worker into `dist/`. The manifest and icons live in `public/`; regenerate the icons with `node scripts/generate-pwa-icons.js` after changing `assets/images/icon.png`.
- **Android APK**: manually trigger [`.github/workflows/build-android-apk.yml`](.github/workflows/build-android-apk.yml) (Actions tab → "Build Android APK" → Run workflow) to build a preview APK with EAS and print the download link in the run summary.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
