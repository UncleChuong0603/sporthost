import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.prepare_nextjs_release import ReleaseError, discover_paths, freeze_release, verify_release


class SourceReleaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='sporthost-release-test-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.paths = ['v2/package.json', 'v2/package-lock.json', 'v2/Dockerfile', 'v2/src/app/page.tsx']
        for name in self.paths:
            self.write(name, 'synthetic source ' + name)
        self.output = self.root / '.vercel' / 'release'

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf8')

    def test_archive_and_frozen_source_have_exact_manifest_bytes(self):
        result = freeze_release(self.root, self.output, self.paths)
        self.assertEqual(verify_release(self.root, self.output, self.paths), result)
        with zipfile.ZipFile(self.output / 'sporthost-nextjs.zip') as bundle:
            self.assertEqual(bundle.namelist(), ['Dockerfile', 'package-lock.json', 'package.json', 'src/app/page.tsx'])
            self.assertEqual(bundle.read('src/app/page.tsx'), (self.root / 'v2/src/app/page.tsx').read_bytes())
        self.assertEqual(json.loads((self.output / 'release-manifest.json').read_text())['deployments'], 0)

    def test_private_files_and_path_escape_cannot_enter_archive(self):
        for name in ['v2/.env.local', 'v2/.local/secret.txt', 'v2/public/uploads/receipt.png', 'v2/tests/key.pem', 'v2/src/config.private.json', 'v2/../.env.dokploy.local', 'marketing/private.txt']:
            with self.subTest(name=name):
                self.write(name, 'synthetic private content')
                with self.assertRaises(ReleaseError):
                    freeze_release(self.root, self.output, self.paths + [name])
                self.assertFalse(self.output.exists())

    def test_source_drift_blocks_reuse_of_a_tested_archive(self):
        freeze_release(self.root, self.output, self.paths)
        self.write('v2/src/app/page.tsx', 'changed after acceptance')
        with self.assertRaisesRegex(ReleaseError, 'Application source changed'):
            verify_release(self.root, self.output, self.paths)

    def test_new_and_deleted_inventory_entries_block_reuse(self):
        freeze_release(self.root, self.output, self.paths)
        self.write('v2/src/new.ts', 'new after acceptance')
        for changed in [self.paths + ['v2/src/new.ts'], self.paths[:-1]]:
            with self.assertRaisesRegex(ReleaseError, 'Application source changed'):
                verify_release(self.root, self.output, changed)

    def test_archive_and_frozen_copy_tampering_are_detected(self):
        freeze_release(self.root, self.output, self.paths)
        archive = self.output / 'sporthost-nextjs.zip'
        original = archive.read_bytes()
        archive.write_bytes(original + b'changed')
        with self.assertRaisesRegex(ReleaseError, 'Release archive changed'):
            verify_release(self.root, self.output, self.paths)
        archive.write_bytes(original)
        (self.output / 'source/package.json').write_text('changed', encoding='utf8')
        with self.assertRaisesRegex(ReleaseError, 'Frozen source no longer matches'):
            verify_release(self.root, self.output, self.paths)

    def test_output_stays_private_and_existing_candidate_is_immutable(self):
        with self.assertRaises(ReleaseError):
            freeze_release(self.root, self.root / 'public-release', self.paths)
        freeze_release(self.root, self.output, self.paths)
        with self.assertRaisesRegex(ReleaseError, 'new immutable release'):
            freeze_release(self.root, self.output, self.paths)

    def test_git_inventory_includes_current_app_changes_and_excludes_marketing_and_env(self):
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True, capture_output=True)
        self.write('v2/.gitignore', '.env*\n!.env.example\nnode_modules/\n')
        self.write('v2/.env.local', 'synthetic private credential')
        self.write('v2/.env.example', 'SECRET_KEY=replace-this-value')
        self.write('marketing/draft.txt', 'unrelated draft')
        self.write('v2/node_modules/ignored.txt', 'generated dependency')
        paths = discover_paths(self.root)
        self.assertIn('v2/.env.example', paths)
        self.assertIn('v2/src/app/page.tsx', paths)
        self.assertNotIn('v2/.env.local', paths)
        self.assertFalse(any('marketing/' in path or 'node_modules/' in path for path in paths))


if __name__ == '__main__':
    unittest.main()
