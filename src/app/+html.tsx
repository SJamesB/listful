import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Root HTML for the static web export. Runs in Node at build time only.
//
// Asset links are relative (no leading slash) so they resolve under the
// GitHub Pages subpath (/listful/) as well as at / locally.

// Registers the service worker (generated into dist/ by scripts/generate-sw.js)
// and, when the app is reopened, checks for a newer deploy. A new worker
// activates immediately, so reload once it takes over to run the new bundle.
const SW_REGISTRATION = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') reg.update().catch(function () {});
      });
    }).catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
  });
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#F5F2EE" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Listful" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="manifest.json" />
        <link rel="apple-touch-icon" href="apple-touch-icon.png" />
        <ScrollViewStyleReset />
        {process.env.NODE_ENV === 'production' ? (
          <script dangerouslySetInnerHTML={{ __html: SW_REGISTRATION }} />
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
