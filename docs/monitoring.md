# Monitoring for clones & impersonation

The Free edition is GPL-3.0, so copying is allowed by design — this is not
about stopping forks. It is about noticing when someone re-uploads our code as
their own product, or ships under our name and logo.

## One command

```bash
node scripts/check-clones.mjs
```

It reports:

- GitHub repositories with a look-alike name (`linux-doctor`, `Linux Doctor`, …),
- GitHub code matches for distinctive strings from this project,
- who owns the `linux-doctor` npm package,
- AUR packages with a similar name and a different maintainer,
- COPR projects with a similar name (best effort).

A similar name is normal — "Linux Doctor" is generic, and several unrelated
projects share it. What matters is copied code or our name/branding used to
imply the project is ours.

## Standing searches

- GitHub code search (bookmark them):
  - `"Linux Doctor only reads system information"`
  - `"MOST URGENT · RECOMMENDED"`
  - `"timers/broken" "zram/ok"`
- Google Alerts for `"Linux Doctor" linux`, `linux-doctor`, `linux-doctor AppImage`.
- Watch the registries where impersonation is possible: npm, AUR, COPR,
  Flathub, Snapcraft, AppImageHub.

## If you find a copy

1. **Copied GPL code, distributed.** That is allowed **if** it stays GPL and
   keeps the notices. If it does not, it is a license violation: ask for the
   source/notice first, then a DMCA/takedown.
2. **Code inside a closed product.** That needs the commercial license — see
   [COMMERCIAL-LICENSE.md](../COMMERCIAL-LICENSE.md).
3. **Our name or logo used to pass it off as ours.** That is a branding issue —
   see [trademark.md](trademark.md).
4. **A store/registry listing.** Report the listing for impersonation, in
   addition to the copyright route.

Not legal advice; for a real case, talk to a lawyer.
