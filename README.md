# SpeakEasy

**Learn a new way to communicate.** A static, mobile-first React + TypeScript learning app for ASL fingerspelling, visual uncontracted English Braille, and International Morse code.

## Practice modes

- **Study:** Flip cards, reverse front/back, save favorites, self-rate, track mastery.
- **Test:** Letters or words; symbol-to-text and text-to-symbol; 10 questions, 60-second sprint, or 3-minute session. Words read from symbols are typed; reverse questions offer four choices. Results include accuracy, mean response time, correct answers/minute, and correct characters/minute.
- **Type:** Convert text to handshape, Braille, or Morse displays. Morse code and Braille Unicode can also be decoded; Morse decode mode includes a dot/dash keypad. Optional Morse audio is available across ASL, Braille and Morse in Study, Test and Type. The shared toggle is saved locally; Study plays the current card (with Replay), Test plays an optional clue, and Type has on-demand playback of the source or decoded text. Browser Web Audio generates the tones offline.
- Saved progress, favorites, audio preference, and last 50 test sessions remain in localStorage, with a compatible local progress key. No account or data collection.

## Notes

ASL here covers the *fingerspelling alphabet*, not ASL as a language; J and Z require motion and have guidance rather than a static image. Word tests avoid those moving letters until animated references are available. Braille is a **visual** representation only and does not teach touch, contractions, or encoding capitalization marks. The Morse examples use International Morse code.

## Local development

```bash
npm install
npm test
npm run build
npm run dev
```

## Deployment

GitHub Actions runs tests, builds a production Vite bundle, injects the app assets into the service-worker precache and publishes `dist/` to GitHub Pages.

Custom domain: `speakeasy.davidlwatsonjr.com` (`public/CNAME`). Select GitHub Actions as Pages source; add the DNS CNAME pointing to `davidlwatsonjr.github.io`.

The PWA manifest and app icons are in `public/`; all assets required to study (including local ASL alphabet illustrations) are hosted in the repository and cached for offline use after first successful load.

## Renaming the repository and domain

GitHub repository name: `speakeasy` (rename from `alltheways` in Settings → General).

The browser treats the old and new subdomains as separate origins. Existing localStorage does not transfer automatically. On the old domain, back up the localStorage value `alltheways:state:v1` before moving the Pages custom domain; import it into the new domain using the browser console if retaining personal progress is important.

## Offline-first verification

SpeakEasy is a static progressive web app. Every feature (Study, Test, Type, local progress, Braille and ASL graphics, and Morse playback) works without internet **after the initial online load has installed its service worker and cached all assets**.

- Fonts (DM Sans and Outfit) are bundled locally from Fontsource, not loaded from Google Fonts.
- The build enumerates every published file, creates a revision-specific precache, and checks its completeness. A failed cache installation leaves the prior working version active.
- The footer shows **Saved for offline use** when the browser has an active service worker; only then should you disconnect. For a first-time installation, remain online until it changes from **Preparing offline files…**.
- To test, launch the app online and wait for that status, switch to airplane mode, completely close it, reopen from your home screen, and exercise all three modes and J/Z diagrams. Your quiz scores and favorites remain on the device.
- Progress is in localStorage. Private browsing, clearing site data, or changing devices can erase it. The first visit on a new device still requires a connection; GitHub Pages cannot be visited offline before the app is cached.
- External links and app updates require internet. The application itself makes no requests to third-party services during use.

CI runs unit tests, compiles the app, precaches the complete site, and simulates an offline service-worker launch. A missing file, remote CSS dependency, or offline loading failure fails the production build.

## Discoverability and SEO

The root page has static introductory content, a canonical URL, social metadata and WebApplication structured data. Three standalone, crawlable reference guides under `public/learn/` link to the corresponding interactive course and are included in the offline cache. `public/robots.txt` and `public/sitemap.xml` expose the four canonical URLs. The app reads the optional `?course=asl|braille|morse` parameter to open a course directly. Query variants use the homepage canonical. Submit the sitemap in Google Search Console after verifying the site; review indexing, search queries and Core Web Vitals periodically. No analytics or external runtime dependencies are added.

## Deep links

Use root query parameters rather than path-based client routes, so GitHub Pages and the offline service worker both serve the same app for direct visits.

- `/?course=asl&mode=study&card=J` opens the J flashcard.
- `/?course=braille&mode=study&filter=numbers&card=3&reverse=1` opens a reversed number card.
- `/?course=morse&mode=test&unit=word&direction=decode&length=60` preconfigures a 60-second word test. The learner must press Start.
- `/?course=braille&mode=type&direction=decode` opens the Braille decoder.

The URL follows course, mode, and public study card or test configuration. Browser Back/Forward restores course and mode entries; changes within a mode replace the current URL. The link icon copies the active view. Favorites and review filters refer only to each device's own deck, and their current cards are never serialized. Typed messages, audio preferences, quiz attempts, and progress stay local. Unknown or unsupported parameters fall back safely. Installed-app shortcuts open each course where supported. The guide reference charts link directly to individual cards. Query variants retain the homepage canonical for SEO.
