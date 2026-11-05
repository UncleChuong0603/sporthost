"""Freeze or verify a local Next.js source candidate; never deploys or reads private env files."""
import argparse
import hashlib
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ROOT_FILES = {
    '.dockerignore', '.gitignore', '.env.example', 'AGENTS.md', 'Dockerfile', 'README.md',
    'package.json', 'package-lock.json', 'next-env.d.ts', 'next.config.ts', 'tsconfig.json',
    'postcss.config.mjs', 'playwright.config.ts', 'vitest.config.ts', 'components.json',
}
DIRECTORIES = {'src', 'public', 'migrations', 'scripts', 'tests'}
FORBIDDEN = {'.git', '.next', '.local', 'node_modules', 'coverage', 'test-results', 'playwright-report', 'uploads', 'backups'}


class ReleaseError(ValueError):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checked_path(root, relative):
    path = PurePosixPath(relative)
    if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] != 'v2' or len(path.parts) < 2:
        raise ReleaseError('Only application files inside v2 may enter a release')
    parts = path.parts[1:]
    if any(part in FORBIDDEN for part in parts) or any(part.startswith('.env') and part != '.env.example' for part in parts):
        raise ReleaseError('Private or generated files are forbidden in release source')
    if any('.private.' in part for part in parts) or path.suffix.lower() in {'.pem', '.key', '.pfx', '.p12', '.db', '.sqlite', '.sqlite3', '.pyc'}:
        raise ReleaseError('Private artifacts are forbidden in release source')
    if parts[0] not in DIRECTORIES and (len(parts) != 1 or parts[0] not in ROOT_FILES):
        raise ReleaseError('An application file is outside the reviewed packaging allowlist')
    actual = root.joinpath(*path.parts)
    app_root = (root / 'v2').resolve()
    if not app_root.is_relative_to(root.resolve()) or (root / 'v2').is_symlink() or actual.is_symlink() or not actual.resolve().is_relative_to(app_root) or not actual.is_file():
        raise ReleaseError('Application source must contain ordinary files within v2')
    return actual, PurePosixPath(*parts).as_posix()


def discover_paths(root):
    raw = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'v2'], stderr=subprocess.DEVNULL)
    paths = sorted(set(item.decode('utf8') for item in raw.split(b'\0') if item))
    for path in paths:
        checked_path(root, path)
    if not {'v2/package.json', 'v2/package-lock.json', 'v2/Dockerfile'}.issubset(paths):
        raise ReleaseError('The release is missing its package or Docker build inputs')
    return paths


def checked_output(root, destination):
    root = root.resolve()
    private_root = (root / '.vercel').resolve()
    destination = destination.resolve()
    if not private_root.is_relative_to(root) or not destination.is_relative_to(private_root) or destination == private_root:
        raise ReleaseError('Release output must stay inside the private workspace artifact directory')
    return destination


def collect(root, paths):
    files = {}
    for path in paths:
        actual, name = checked_path(root, path)
        if name in files:
            raise ReleaseError('Duplicate source archive entry')
        files[name] = actual.read_bytes()
    return dict(sorted(files.items()))


def inventory(files):
    return {name: {'sha256': digest(data), 'bytes': len(data)} for name, data in files.items()}


def source_digest(entries):
    return digest(''.join(f'{name}\0{entry["sha256"]}\n' for name, entry in sorted(entries.items())).encode())


def freeze_release(root, destination, paths, git_head=None):
    root = root.resolve()
    destination = checked_output(root, destination)
    if destination.exists():
        raise ReleaseError('Use a new immutable release directory')
    files = collect(root, paths)
    entries = inventory(files)
    destination.mkdir(parents=True)
    source = destination / 'source'
    for name, data in files.items():
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    archive = destination / 'sporthost-nextjs.zip'
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED) as bundle:
        for name, data in files.items():
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, data)
    manifest = {
        'format': 1, 'created_utc': datetime.now(timezone.utc).isoformat(), 'git_head': git_head,
        'source_sha256': source_digest(entries), 'archive_sha256': digest(archive.read_bytes()),
        'files': entries, 'database_writes': 0, 'deployments': 0,
    }
    (destination / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    verify_release(root, destination, paths)
    return manifest


def verify_release(root, destination, paths):
    root = root.resolve()
    destination = checked_output(root, destination)
    source_root = (destination / 'source').resolve()
    if not source_root.is_relative_to(destination) or (destination / 'source').is_symlink():
        raise ReleaseError('Frozen source escaped its candidate directory')
    for name in ('release-manifest.json', 'sporthost-nextjs.zip'):
        item = destination / name
        if item.is_symlink() or not item.resolve().is_relative_to(destination):
            raise ReleaseError('Release metadata or archive escaped its candidate directory')
    manifest = json.loads((destination / 'release-manifest.json').read_text(encoding='utf8'))
    current = inventory(collect(root, paths))
    if current != manifest['files'] or source_digest(current) != manifest['source_sha256']:
        raise ReleaseError('Application source changed; build and validate a fresh candidate')
    archived_source = {}
    for name in manifest['files']:
        # Apply the same boundary check before accessing a manifest-supplied name.
        checked_path(root, 'v2/' + name)
        frozen = destination / 'source' / name
        if frozen.is_symlink() or not frozen.resolve().is_relative_to((destination / 'source').resolve()):
            raise ReleaseError('Frozen source escaped its candidate directory')
        archived_source[name] = frozen.read_bytes()
    if inventory(archived_source) != current:
        raise ReleaseError('Frozen source no longer matches the reviewed source')
    archive = destination / 'sporthost-nextjs.zip'
    if digest(archive.read_bytes()) != manifest['archive_sha256']:
        raise ReleaseError('Release archive changed')
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None or bundle.namelist() != list(current):
            raise ReleaseError('Release archive is corrupt or contains unexpected entries')
        if inventory({name: bundle.read(name) for name in bundle.namelist()}) != current:
            raise ReleaseError('Release archive does not match the reviewed source')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--verify', type=Path)
    args = parser.parse_args()
    if bool(args.output_dir) == bool(args.verify):
        parser.error('Choose exactly one of --output-dir or --verify')
    root = Path(__file__).resolve().parents[1]
    paths = discover_paths(root)
    if args.verify:
        manifest = verify_release(root, args.verify, paths)
    else:
        head = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
        manifest = freeze_release(root, args.output_dir, paths, git_head=head)
        # Detect new/deleted files added by another process during packaging as well.
        verify_release(root, args.output_dir, discover_paths(root))
    print(json.dumps({'verified': True, 'files': len(manifest['files']), 'source_sha256': manifest['source_sha256'], 'archive_sha256': manifest['archive_sha256'], 'deployments': 0, 'database_writes': 0}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'verified': False, 'error_category': type(error).__name__, 'detail': str(error) if isinstance(error, ReleaseError) else 'Release preparation stopped; no private values logged'}))
        raise SystemExit(1)
