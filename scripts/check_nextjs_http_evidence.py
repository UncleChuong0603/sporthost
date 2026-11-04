"""Summarize audited HTTP contracts from private Playwright traces, without URLs/PII.

Only successful test results count. Server Action POSTs do not count as native
legacy-form coverage. Raw traces/reports stay ignored; the output names only
audited route templates, statuses and test filenames.
"""
import argparse
import csv
import json
import re
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--environment', choices=('local', 'preview'), required=True)
    parser.add_argument('--supplement', type=Path, help='Explicit later report rerunning failed cases against the same candidate')
    parser.add_argument('--report', type=Path, help='Private primary report for a later tested release')
    args = parser.parse_args()
    report = json.loads((args.report or ROOT / f'.vercel/nextjs/e2e-{args.environment}-report.private.json').read_text(encoding='utf8'))
    rows = list(csv.DictReader((ROOT / 'docs/nextjs/sprint-0/ROUTE_PARITY.csv').open(encoding='utf8', newline='')))
    matches = {}
    for row in rows:
        escaped = re.escape(row['legacy_path'])
        pattern = re.sub(r'\\\{[^}]+\\\}', '[^/]+', escaped)
        matches[(row['method'], row['legacy_path'])] = (re.compile('^' + pattern + '$'), {}, set())
    origin = 'http://127.0.0.1:3100' if args.environment == 'local' else 'https://sporthost-v2-preview-bwtxar-42-96-4-79.sslip.io'

    def observe(method, url, status, headers, filename):
        parsed = urlsplit(url)
        if status < 100 or parsed.scheme + '://' + parsed.netloc != origin:
            return
        if method == 'POST' and any(header['name'].lower() == 'next-action' for header in headers):
            return
        for (verb, _), (pattern, statuses, files) in matches.items():
            if verb == method and pattern.fullmatch(parsed.path):
                statuses[str(status)] = statuses.get(str(status), 0) + 1
                files.add(filename)

    tests = []
    failed = []
    cases = {}
    retested = []

    def collect(suites, supplemental=False):
        for suite in suites:
            collect(suite.get('suites', []), supplemental)
            for spec in suite.get('specs', []):
                for test in spec.get('tests', []):
                    key = (spec['id'], test['projectName'])
                    if supplemental:
                        assert key in cases, 'Supplement may only rerun cases from the primary report'
                        retested.append({'file': Path(spec['file']).name, 'project': test['projectName'], 'previous_status': cases[key][1]['results'][-1]['status']})
                    cases[key] = (spec, test)
    collect(report['suites'])
    if args.supplement:
        supplemental = json.loads(args.supplement.read_text(encoding='utf8'))
        assert supplemental['config']['configFile'] == report['config']['configFile'], 'Different browser configuration'
        collect(supplemental['suites'], True)

    def visit():
        for spec, test in cases.values():
                    result = test['results'][-1]
                    if result['status'] != 'passed':
                        failed.append(Path(spec['file']).name)
                        continue
                    tests.append(test)
                    for attachment in result.get('attachments', []):
                        if attachment['name'] != 'trace':
                            continue
                        with zipfile.ZipFile(attachment['path']) as archive:
                            for name in archive.namelist():
                                if not name.endswith('.network'):
                                    continue
                                for line in archive.read(name).splitlines():
                                    event = json.loads(line)
                                    if event.get('type') != 'resource-snapshot':
                                        continue
                                    snapshot = event['snapshot']; request = snapshot['request']
                                    observe(request['method'], request['url'], snapshot['response']['status'], request.get('headers', []), Path(spec['file']).name)
    visit()
    assert tests, 'No browser cases recorded'
    for row in json.loads((ROOT / f'.vercel/nextjs/{args.environment}-get-smoke.private.json').read_text(encoding='utf8')):
        observe('GET', origin + row['path'], row['status'], [], 'strict-get-smoke')

    output = []
    for (method, path), (_, statuses, files) in matches.items():
        passed = any(200 <= int(status) < 400 for status in statuses)
        unavailable = method == 'POST' and path in ('/account/verify-email', '/forgot-password') and '503' in statuses
        output.append({'method': method, 'legacy_path': path, 'status': 'observed-success' if passed else 'observed-mail-disabled' if unavailable else 'missing-success', 'http_statuses': ' '.join(sorted(statuses)), 'evidence': ' '.join(sorted(files))})
    destination = ROOT / f'docs/nextjs/HTTP_EVIDENCE_{args.environment.upper()}.csv'
    with destination.open('w', encoding='utf8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(output[0])); writer.writeheader(); writer.writerows(output)
    missing = [row['method'] + ' ' + row['legacy_path'] for row in output if row['status'] == 'missing-success']
    print(json.dumps({'environment': args.environment, 'passed_browser_cases': len(tests), 'failed_browser_cases': failed, 'explicit_retested_cases': retested, 'contracts': len(output), 'missing_success': missing, 'mail_disabled_contracts': sum(row['status'] == 'observed-mail-disabled' for row in output)}))
    if missing or failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
