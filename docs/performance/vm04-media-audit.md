# VM-04 mobile media audit

Measured July 9, 2026 with Lighthouse 12.8.2 using its default mobile simulated-throttling profile. The production baseline is the pre-change `https://valomapped.com/` landing page. The final measurement is the median of three cold Lighthouse runs against a fresh local production build.

The ten repository MP4 assets total 76,003,191 bytes (72.48 MiB). The change keeps every preview but attaches each poster and video source only when its card approaches the viewport. Playback is separately gated by actual visibility, and reduced-motion mode never attaches MP4 sources.

## Results

| Metric | Live before (1 run) | Local diagnostic: sources gated, posters eager (1 run) | Local final (3-run median) |
| --- | ---: | ---: | ---: |
| Performance score | 99 | 77 | 99 |
| Accessibility score | 100 | 100 | 100 |
| First Contentful Paint | 1,104 ms | 911 ms | 908 ms |
| Simulated Largest Contentful Paint | 2,154 ms | 6,836 ms | 2,087 ms |
| Raw observed Largest Contentful Paint | 358 ms | 188 ms | 134 ms |
| Total Blocking Time | 41 ms | 43 ms | 52 ms |
| Cumulative Layout Shift | 0.0047 | 0 | 0 |
| Initial requests | 49 | 32 | 23 |
| Initial transfer | 31,026,148 B | 1,390,563 B | 320,441 B |
| MP4 requests / transfer | 29 / 30,757,843 B | 2 / 67,518 B | 2 / 67,518 B |
| Poster requests / transfer | 0 / 0 B | 10 / 1,072,066 B | 1 / 1,259 B |

Compared with the live pre-change run, the final build reduces initial transfer by 30,705,707 bytes (99.0%), initial requests by 53.1%, and initial MP4 transfer by 99.8%. Only the near-viewport preview is eligible to request media during the audit; the other nine poster and video sources remain detached.

The intermediate run exposed an important implementation bug: gating only the MP4 `src` still fetched all ten `poster` resources from the initial HTML. On local HTTP/1.1, Lighthouse's simulated scheduler modeled those medium-priority posters ahead of application JavaScript and produced a 6.8-second simulated LCP even though the trace-observed LCP was 188 ms. Deferring the posters restored the simulated score while removing another 1.07 MB from initial transfer.

## Interpretation limits

The before and after environments are not protocol-identical: production used HTTPS/HTTP/2, while the local Next.js server used HTTP/1.1. Lighthouse's simulated score is sensitive to that scheduling difference. The transfer/request comparison directly verifies the intended behavior, but the LCP numbers should be treated as a regression check rather than a deploy-equivalent speedup claim. Before release, repeat three cold mobile runs on an HTTPS/HTTP/2 preview deployment and retain the median.

## Reproduction

Build and serve the application, then run three cold audits:

```powershell
npm run build
npm run start -- -H 127.0.0.1 -p 3101
npx --yes lighthouse http://127.0.0.1:3101 --only-categories=performance,accessibility --output=json
```

Behavioral assertions are also part of `npm run test:a11y`: they verify deferred offscreen posters and MP4 sources, reduced-motion suppression, viewport-triggered loading/playback, and pausing after a preview leaves the viewport.
