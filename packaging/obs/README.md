# openSUSE Build Service (OBS)

OBS builds RPMs for **Fedora, RHEL/CentOS, openSUSE and others** from one spec
and hosts a repository users can add. It is the COPR alternative that does
**not** need a Fedora account.

## One-time setup

1. Create an openSUSE account: <https://id.opensuse.org/> → Register.
2. Install `osc` (the CLI): `sudo zypper in osc` (openSUSE),
   `sudo dnf install osc` (Fedora), `sudo pacman -S osc` (Arch).
   On immutable Fedora: `rpm-ostree install osc`.
3. Log in once (writes `~/.config/osc/oscrc`):
   ```bash
   osc -A https://api.opensuse.org ls
   ```

## Create the project (web UI is easiest)

1. Sign in at <https://build.opensuse.org/>.
2. Your `home:<username>` project already exists; add a subproject, e.g.
   `home:<username>:linux-doctor`.
3. Project → **Repositories** → add **Fedora 42** (and, optionally,
   RHEL/CentOS and openSUSE Leap/Tumbleweed).
4. Users then add the repo, e.g.:
   ```
   sudo dnf config-manager --add-repo \
     https://download.opensuse.org/repositories/home:/<username>:/linux-doctor/Fedora_42/home:<username>:linux-doctor.repo
   ```

## Upload and build

```bash
osc checkout home:<username>:linux-doctor
cd home:<username>:linux-doctor
cp <repo>/packaging/obs/linux-doctor.spec .
cp <repo>/packaging/obs/_service .
osc add linux-doctor.spec _service
osc commit
```

OBS runs the `download_files` service, fetches the release tarball named in
`Source0`, and builds. Watch it in the web UI or with `osc results`.

## Notes

- `linux-doctor.spec` here is a copy of [`../linux-doctor.spec`](../linux-doctor.spec)
  (COPR and local `rpmbuild` use that one); re-copy it on every version bump.
- The package is `noarch` and needs Node ≥ 20 at runtime. If a chroot does not
  resolve `nodejs`, pin `nodejs20` for that repository with a `%if 0%{?suse_version}`.
