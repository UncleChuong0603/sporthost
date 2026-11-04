"""Inventory legacy source without importing the app, dotenv or connecting to services.

Run: python -m scripts.audit_nextjs_sprint0 [--check]
This is migration tooling only; it is not part of the Next.js target runtime.
"""
import argparse
import ast
import hashlib
import json
import csv
import io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs' / 'nextjs' / 'sprint-0'


def expr(node):
    return ast.unparse(node) if node is not None else None


def calls(node):
    return sorted({expr(item.func) for item in ast.walk(node) if isinstance(item, ast.Call)})


def target_module(path):
    return {
        'main': 'shared core; auth, clubs, members, sessions, bookings, dues, exports, health',
        'accounts': 'auth; platform administration',
        'attendance': 'attendance; session lifecycle',
        'booking_service': 'bookings; policies; guest capabilities',
        'booking_routes': 'bookings; guest capabilities',
        'club_deletion': 'clubs; explicit deletion workflow',
        'club_settings': 'clubs; validation and audit',
        'finance_service': 'billing; reconciliation',
        'finance_routes': 'billing; reconciliation',
        'finance_models': 'db schema; billing and platform ledger',
        'mail': 'infrastructure mail (SMTP)',
        'models_extra': 'db schema; scheduling, access, assets, accounts',
        'payment_config': 'payments; versioned payment snapshots',
        'payments': 'payments; proof review; media authorization; guest RSVP',
        'permissions': 'access control',
        'platform_ledger': 'platform ledger',
        'security': 'rate limits',
        'settings': 'server environment validation',
        'sports': 'sports catalog',
        'storage': 'private media (persistent VPS volume)',
        'workspace': 'workspace queries; scheduling; recurring rules; dues; access',
    }.get(path.stem, 'operator/test tooling; see source docstring')


def inventory():
    paths = sorted({*ROOT.glob('*.py'), *(p for base in ('app', 'scripts', 'tests', 'alembic')
                    for p in (ROOT / base).rglob('*.py') if '__pycache__' not in p.parts)})
    result = {'format': 1, 'scope': 'working tree, including uncommitted files; no secrets or live rows',
              'files': [], 'routes': [], 'models': [], 'tests': [], 'migrations': []}
    for path in paths:
        raw = path.read_bytes()
        source = raw.decode('utf-8-sig')
        tree = ast.parse(source, filename=str(path))
        rel = path.relative_to(ROOT).as_posix()
        result['files'].append({'path': rel, 'sha256': hashlib.sha256(raw).hexdigest(),
            'lines': len(source.splitlines()), 'docstring': ast.get_docstring(tree),
            'target': target_module(path),
            'functions': [{'name': n.name, 'line': n.lineno, 'end_line': n.end_lineno,
                           'calls': calls(n)} for n in ast.walk(tree)
                          if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]})
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for dec in node.decorator_list:
                    if (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)
                            and expr(dec.func.value) == 'app'
                            and dec.func.attr in ('get', 'post', 'put', 'patch', 'delete', 'head', 'options')
                            and dec.args and isinstance(dec.args[0], ast.Constant)):
                        result['routes'].append({'method': dec.func.attr.upper(), 'path': dec.args[0].value,
                            'source': rel, 'line': node.lineno, 'handler': node.name,
                            'signature': expr(node.args), 'calls': calls(node),
                            'target': target_module(path)})
                if path.parent.name == 'tests' and node.name.startswith('test_'):
                    result['tests'].append({'source': rel, 'line': node.lineno, 'name': node.name,
                        'decorators': [expr(d) for d in node.decorator_list], 'docstring': ast.get_docstring(node)})
            if isinstance(node, ast.ClassDef):
                table = next((n.value.value for n in node.body if isinstance(n, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == '__tablename__' for t in n.targets)
                    and isinstance(n.value, ast.Constant)), None)
                if table:
                    result['models'].append({'class': node.name, 'table': table, 'source': rel, 'line': node.lineno,
                        'fields': [{'name': n.target.id, 'annotation': expr(n.annotation), 'mapping': expr(n.value)}
                            for n in node.body if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)],
                        'table_args': next((expr(n.value) for n in node.body if isinstance(n, ast.Assign)
                            and any(isinstance(t, ast.Name) and t.id == '__table_args__' for t in n.targets)), None)})
        if path.parent.name == 'versions':
            assignments = {t.id: n.value.value for n in tree.body if isinstance(n, ast.Assign)
                           for t in n.targets if isinstance(t, ast.Name) and isinstance(n.value, ast.Constant)}
            result['migrations'].append({'source': rel, 'revision': assignments.get('revision'),
                'down_revision': assignments.get('down_revision'), 'summary': ast.get_docstring(tree),
                'operations': calls(tree)})
    assets = sorted([*(ROOT / 'app' / 'templates').glob('*.html'), *(ROOT / 'public' / 'static').glob('*')])
    result['assets'] = [{'path': p.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
                         'lines': len(p.read_text(encoding='utf-8-sig').splitlines())} for p in assets if p.is_file()]
    result['routes'].sort(key=lambda r: (r['path'], r['method']))
    result['models'].sort(key=lambda m: m['table'])
    return result


def markdown(data):
    lines = ['# Generated legacy inventory', '',
        'Source: working tree. Regenerate with `python -m scripts.audit_nextjs_sprint0`; verify with `--check`.', '',
        'AST inventory is exhaustive for Python files in the stated roots. Calls are syntactic evidence,',
        'not proof of authorization/locking: review the business rules and acceptance matrix too.', '',
        f"{len(data['files'])} Python files; {len(data['routes'])} application HTTP routes; "
        f"{len(data['models'])} ORM models; {len(data['tests'])} test functions; "
        f"{len(data['migrations'])} historical migrations; {len(data['assets'])} templates/static assets.", '',
        'Framework-generated OpenAPI/docs routes and the `/static` mount are described in AUDIT.md.', '',
        '## Source modules', '', '| Source | Lines | Target responsibility |', '| --- | ---: | --- |']
    for item in data['files']:
        lines.append(f"| `{item['path']}` | {item['lines']} | {item['target']} |")
    lines += ['', '## Application routes', '', '| Method | Path | Source handler | Target module |', '| --- | --- | --- | --- |']
    for route in data['routes']:
        lines.append(f"| {route['method']} | `{route['path']}` | `{route['source']}:{route['line']}` `{route['handler']}` | {route['target']} |")
    lines += ['', '## Persisted models', '',
        'Types below are ORM annotations, not PostgreSQL DDL. Relationship fields are marked as relationships',
        'in the JSON mapping. The read-only database report is the authority for physical columns/defaults.', '']
    for model in data['models']:
        lines += [f"### `{model['table']}` — `{model['class']}`", '', f"Source: `{model['source']}:{model['line']}`.", '',
            '| Attribute | Type | Mapping / client defaults |', '| --- | --- | --- |']
        for f in model['fields']:
            esc = lambda s: (s or 'inferred').replace('|', '&#124;').replace('\n', ' ')
            lines.append(f"| `{f['name']}` | `{esc(f['annotation'])}` | `{esc(f['mapping'])}` |")
        if model['table_args']:
            lines += ['', 'Constraints: `' + model['table_args'].replace('|', '&#124;') + '`.', '']
    lines += ['', '## Historical migrations', '', '| Revision | Parent | Source |', '| --- | --- | --- |']
    for m in data['migrations']:
        lines.append(f"| `{m['revision']}` | `{m['down_revision']}` | `{m['source']}` |")
    lines += ['', '## Test inventory', '',
        'These are test function counts, not collected parametrized case counts. Execution results live in VALIDATION.md.', '']
    for source in sorted({t['source'] for t in data['tests']}):
        lines += [f'### `{source}`', '']
        lines += [f"- `{t['name']}` (line {t['line']})" for t in data['tests'] if t['source'] == source]
        lines.append('')
    lines += ['## Templates and assets', '', '| File | Lines |', '| --- | ---: |']
    lines += [f"| `{a['path']}` | {a['lines']} |" for a in data['assets']]
    return '\n'.join(lines) + '\n'


def route_parity(data):
    output = io.StringIO(newline='')
    writer = csv.writer(output, lineterminator='\n')
    writer.writerow(['method', 'legacy_path', 'legacy_source', 'target_contract', 'acceptance_ids', 'status'])
    for route in data['routes']:
        path = route['path']
        ids = ['A03']
        if path.startswith(('/login','/signup','/logout','/account','/forgot-password','/reset-password','/verify-email')):
            ids = ['A01','A02','A21']
        elif path.startswith(('/health','/ready','/static')): ids = ['A19','A20']
        elif 'delete' in path: ids = ['A03','A16']
        elif path.startswith('/admin'): ids = ['A03','A14']
        elif path.startswith('/join'): ids = ['A04','A06','A07','A08']
        elif 'billing' in path: ids = ['A10','A11','A12','A14']
        elif any(x in path for x in ('proof','payment','/qr')): ids = ['A08','A13','A15']
        elif path.startswith('/attend'): ids = ['A06','A07','A08','A09']
        elif path.startswith('/dues') or '/dues' in path or 'prices' in path: ids = ['A10','A15']
        elif any(x in path for x in ('attendance','replace','walk-ins','lifecycle')): ids = ['A07','A09']
        elif 'bookings' in path or path.endswith('/fixed'): ids = ['A06','A07','A08']
        elif path.startswith('/rules') or path.endswith('/invite-fixed') or path.endswith('/games'): ids = ['A05','A07']
        elif path.startswith('/finance') or 'export.csv' in path: ids = ['A03','A15']
        elif path.startswith('/members') or '/members' in path: ids = ['A03','A04']
        elif path.startswith('/games'): ids = ['A03','A05','A09','A10']
        target = 'Same URL: Next page/GET Route Handler' if route['method']=='GET' else 'Same URL: thin Next POST Route Handler, rewrite where page shares URL'
        writer.writerow([route['method'], path, f"{route['source']}:{route['line']}", target, ' '.join(ids), 'pending'])
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = inventory()
    artifacts = {'inventory.json': json.dumps(data, indent=2, ensure_ascii=False) + '\n',
                 'INVENTORY.md': markdown(data), 'ROUTE_PARITY.csv': route_parity(data)}
    if args.check:
        stale = [name for name, content in artifacts.items() if not (OUTPUT / name).exists()
                 or (OUTPUT / name).read_text(encoding='utf-8') != content]
        if stale:
            raise SystemExit('Sprint 0 inventory is stale: ' + ', '.join(stale))
        print('Sprint 0 inventory matches the working tree.')
    else:
        OUTPUT.mkdir(parents=True, exist_ok=True)
        for name, content in artifacts.items():
            (OUTPUT / name).write_text(content, encoding='utf-8', newline='\n')
        print(json.dumps({key: len(data[key]) for key in ('files', 'routes', 'models', 'tests', 'migrations', 'assets')}))


if __name__ == '__main__':
    main()
