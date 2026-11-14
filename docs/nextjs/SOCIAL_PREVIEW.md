# SportHost link previews

Released on 2026-11-14 at https://sporthost.online.

The root metadata includes Open Graph and Twitter large-image cards with Vietnamese title, description, site name, locale, image alternative text and absolute HTTPS image URL. Only the homepage sets its canonical and `og:url` to the homepage; other destinations retain their own shared URL. Cards contain generic product branding, with no club, player, payment or private-link data. Existing robots and authorization policy is retained.

The public PNG is `/images/sporthost-share-v1.png`: 1200 × 630, 281,880 bytes, SHA-256 `10c6ca92dcca8fa23df3319aaad01f6344bcba24d968d0ee7b62c30b23527b7d`. Artwork uses the existing SportHost mark, fonts and synthetic demonstration screenshots. Its editable source is `marketing/social/link-preview/sporthost-share.html`; run `node scripts/render-social-preview.mjs` from `v2/` with installed Microsoft Edge to render it. When changing a published image, use a new filename and update metadata so cached image URLs remain predictable.

## Verification and release

- The current repository and the isolated production candidate both passed Next.js production build, TypeScript and the standalone artifact scan.
- The social-preview browser test passed on desktop and mobile for both source trees. It checks raw Facebook-crawler HTML, the actual public PNG bytes/dimensions and that sign-in links do not inherit the homepage canonical/`og:url`.
- Preview deployment `C9KcBcEYa2EQ-nZWuQnZW` completed and passed 13 read-only HTTP checks before production activation.
- Production deployment `T93B-BWX5H8Hl949wtJsl` completed. All 13 read-only checks passed with a Facebook crawler user-agent: title, description, URL, image URL/dimensions/hash, Twitter card, public anonymous image download, login, preserved deep links, homepage, health and readiness.
- Production has one healthy running container, UID/GID `10001:10001`, port 8000, its existing upload volume and no public host port binding. No database migration, data mutation, account creation or email was performed.

Production uses an earlier application release than repository `main`. This release was built from the retained production source and changes only four paths: `src/app/layout.tsx`, `src/app/page.tsx`, `src/lib/site-metadata.ts` and the public PNG. It does not activate the newer admin/club-connection source or migrations. Future deployment from `main` must still follow the requirements for those features.

Candidate ZIP SHA-256: `549aedebfb16498ff29bfe202dc29c958a7b3f84936ff3b46ad650e699411a7b`. Runtime image: `sha256:596983099dfdf4324de1189aaa7f1dce68116870ddeb1f687080fe83bba06cd7`.

Private source archives, original application configurations and HTTP reports are under `.vercel/nextjs/social-preview-20261114/`. The previous production image `sha256:8f0ceafb56f54f41c1565f4c8618ee4de18a272bb9f09e13bd1d456d35c52d12` and exited container remain available. Roll back using the retained compatible application source/image and current runtime environment/upload volume; do not restore an older database.

HTTP verification proves metadata and image availability. It does not prove Facebook has refreshed its own cached card or rendered a particular post. If an older preview remains, use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) for `https://sporthost.online/`, then request a fresh scrape and paste the link again.
