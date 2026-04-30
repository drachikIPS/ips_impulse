"""End-to-end approval flow simulation — run with: python test_flows.py"""
import requests, json, sys

BASE = 'http://localhost:8000'
issues = []

def login(email, pw='admin123'):
    r = requests.post(f'{BASE}/api/auth/login', json={'email': email, 'password': pw})
    d = r.json()
    if 'access_token' not in d:
        print(f'  LOGIN FAILED for {email}: {d}')
        return None
    return d['access_token']

def api(method, path, token, pid=1, data=None):
    h = {'Authorization': f'Bearer {token}', 'X-Project-ID': str(pid)}
    fn = getattr(requests, method.lower())
    kw = {'headers': h}
    if data is not None:
        kw['json'] = data
    elif method in ('POST', 'PUT'):
        kw['json'] = {}
    r = fn(f'{BASE}{path}', **kw)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text

def check(label, condition, detail=''):
    if not condition:
        issues.append(f'{label}: {detail}')
        print(f'  FAIL: {label} — {detail}')
    else:
        print(f'  OK: {label}')

# ============================================================
print('=== 1. INVOICE FLOW ===')
owner = login('O@O.com')

# Create (DRAFT)
c, inv = api('POST', '/api/budget/invoices', owner, 1, {
    'order_id': 1, 'invoice_number': 'FLOW-INV-001', 'amount': 50, 'invoice_date': '2026-04-16'
})
check('Create invoice -> DRAFT', c == 200 and inv.get('status') == 'DRAFT', f'{c} {inv.get("status","")}')
iid = inv.get('id')

# Submit (PENDING)
c, r = api('POST', f'/api/budget/invoices/{iid}/submit', owner, 1)
check('Submit invoice -> PENDING', c == 200 and r.get('status') == 'PENDING', f'{c} {r.get("status","")}')

# Reject with comment
c, r = api('POST', f'/api/budget/invoices/{iid}/reject', owner, 1, {'comment': 'Amount incorrect'})
check('Reject invoice -> REJECTED', c == 200 and r.get('status') == 'REJECTED', f'{c} {r.get("status","")}')
check('Rejection comment saved', r.get('review_comment') == 'Amount incorrect', r.get('review_comment',''))

# Resubmit
c, r = api('POST', f'/api/budget/invoices/{iid}/resubmit', owner, 1)
check('Resubmit invoice -> PENDING', c == 200 and r.get('status') == 'PENDING', f'{c} {r.get("status","")}')

# Approve with comment
c, r = api('POST', f'/api/budget/invoices/{iid}/approve', owner, 1, {'comment': 'All good now'})
check('Approve invoice', c == 200, f'{c} {r.get("status","")}')

# Cleanup
api('DELETE', f'/api/budget/invoices/{iid}', owner, 1)

# ============================================================
print('\n=== 2. SCOPE CHANGE FLOW ===')
c, sc = api('POST', '/api/scope-changes', owner, 1, {
    'description': 'Test SC', 'cost': 5000, 'schedule_impact_months': 2, 'package_id': 2
})
check('Create SC -> DRAFT', c == 200 and sc.get('status') == 'DRAFT', f'{c} {sc.get("status","")}')
sid = sc.get('id')

c, r = api('POST', f'/api/scope-changes/{sid}/submit', owner, 1)
check('Submit SC -> SUBMITTED', c == 200 and r.get('status') == 'SUBMITTED', f'{c} {r.get("status","")}')

# PMC approve with comment
c, r = api('POST', f'/api/scope-changes/{sid}/pmc-review', owner, 1, {'approved': True, 'comment': 'PMC OK'})
check('PMC approve SC', c == 200 and r.get('pmc_approved') == True, f'{c} pmc_approved={r.get("pmc_approved","")}')
check('PMC comment saved', r.get('pmc_comment') == 'PMC OK', r.get('pmc_comment',''))

# Client reject with comment
c, r = api('POST', f'/api/scope-changes/{sid}/client-review', owner, 1, {'approved': False, 'comment': 'Too expensive'})
check('Client reject SC -> REJECTED', c == 200 and r.get('status') == 'REJECTED', f'{c} {r.get("status","")}')
check('Client comment saved', r.get('client_comment') == 'Too expensive', r.get('client_comment',''))

api('DELETE', f'/api/scope-changes/{sid}', owner, 1)

# ============================================================
print('\n=== 3. PROGRESS REPORT FLOW ===')
c, tasks = api('GET', '/api/schedule/tasks', owner, 1)
task_list = tasks if isinstance(tasks, list) else []
print(f'  Tasks available: {len(task_list)}')

if len(task_list) >= 2:
    pkg = task_list[0].get('package_id')
    pkg_tasks = [t for t in task_list if t.get('package_id') == pkg][:2]
    entries = [{'task_id': t['id'], 'percentage': 60, 'note': 'Progress'} for t in pkg_tasks]

    # Create as draft
    c, pr = api('POST', '/api/schedule/progress-reports/bulk', owner, 1, {
        'package_id': pkg, 'entries': entries, 'submit': False
    })
    check('Create PR draft', c == 200 and pr.get('status') == 'DRAFT', f'{c} {pr.get("status","")}')
    prid = pr.get('id')

    if prid:
        # Submit
        c, r = api('POST', f'/api/schedule/progress-reports/{prid}/submit', owner, 1)
        check('Submit PR -> SUBMITTED', c == 200 and r.get('status') == 'SUBMITTED', f'{c} {r.get("status","")}')

        # PMC review (task_approvals may not be supported yet)
        c, r = api('POST', f'/api/schedule/progress-reports/{prid}/pmc-review', owner, 1, {
            'approved': True, 'comment': 'PMC approved'
        })
        check('PMC review PR', c == 200, f'{c} {r}')

        # Client review - reject
        c, r = api('POST', f'/api/schedule/progress-reports/{prid}/client-review', owner, 1, {
            'approved': False, 'comment': 'Client rejects task 2'
        })
        check('Client reject PR', c == 200, f'{c} {r}')

        # Check status
        c, prs = api('GET', '/api/schedule/progress-reports', owner, 1)
        this_pr = next((p for p in prs if p.get('id') == prid), None) if isinstance(prs, list) else None
        if this_pr:
            check('PR status after reject', this_pr.get('status') == 'REJECTED', f'status={this_pr.get("status","")}')
            check('Client comment visible', this_pr.get('client_comment') == 'Client rejects task 2', this_pr.get('client_comment',''))

        api('POST', f'/api/schedule/progress-reports/{prid}/cancel', owner, 1)
else:
    print('  SKIP: Not enough tasks')

# ============================================================
print('\n=== 4. DOCUMENT FLOW ===')
c, docs = api('GET', '/api/documents', owner, 1)
doc_list = docs if isinstance(docs, list) else []
approved_docs = [d for d in doc_list if d.get('last_approved_version') is not None]
print(f'  Documents: {len(doc_list)}, approved: {len(approved_docs)}')

# Check receipt endpoints
c, receipts = api('GET', '/api/documents/receipts/pending', owner, 1)
check('Pending receipts endpoint', c == 200, f'{c}')
print(f'  Pending receipts: {len(receipts) if isinstance(receipts, list) else receipts}')

if isinstance(receipts, list) and len(receipts) > 0:
    rc = receipts[0]
    c, r = api('POST', f'/api/documents/{rc["document_id"]}/receipts/{rc["package_id"]}/acknowledge', owner, 1)
    check('Acknowledge receipt', c == 200 and r.get('acknowledged') == True, f'{c} {r}')

# ============================================================
print('\n=== 5. ITP FLOW ===')
c, itps = api('GET', '/api/qc/approvals', owner, 1)
check('ITP approvals endpoint', c == 200, f'{c}')
print(f'  ITP records in review: {len(itps) if isinstance(itps, list) else itps}')

c, my_itps = api('GET', '/api/qc/my-pending-reviews', owner, 1)
check('My pending ITP reviews', c == 200, f'{c}')
print(f'  My pending ITP reviews: {len(my_itps) if isinstance(my_itps, list) else my_itps}')

# ============================================================
print('\n=== 6. ALL MY ACTION POINTS ENDPOINTS ===')
endpoints = [
    ('Meeting points', '/api/meeting-points?responsible_id=4'),
    ('Pending invoice reviews', '/api/budget/invoices/pending-review'),
    ('Rejected invoices', '/api/budget/invoices/my-rejected'),
    ('Open risks', '/api/risks/my-open'),
    ('Pending SC reviews', '/api/scope-changes/pending-reviews'),
    ('Rejected SCs', '/api/scope-changes/my-rejected'),
    ('Pending PR reviews', '/api/schedule/pending-reviews'),
    ('Rejected PRs', '/api/schedule/my-rejected'),
    ('Pending doc reviews', '/api/documents/my-pending-reviews'),
    ('Pending doc receipts', '/api/documents/receipts/pending'),
    ('Pending ITP reviews', '/api/qc/my-pending-reviews'),
    ('Rejected ITPs', '/api/qc/my-rejected-itps'),
    ('Open punches', '/api/qc/my-open-punches'),
    ('Review punches', '/api/qc/my-review-punches'),
]
for name, path in endpoints:
    c, data = api('GET', path, owner, 1)
    count = len(data) if isinstance(data, list) else f'ERROR'
    check(f'{name}', c == 200, f'{c} {data if c != 200 else count}')

# ============================================================
print('\n=== 7. PERMISSIONS ===')
team = login('T@T.com')  # contact 5, PROJECT_TEAM, pmc_comm on pkg 1
vendor = login('V@V.com')  # contact 50, VENDOR

c, r = api('GET', '/api/budget/invoices/pending-review', team, 1)
check('Team reviewer sees pending invoices', c == 200, f'{c}')

c, r = api('GET', '/api/budget/invoices/pending-review', vendor, 1)
check('Vendor sees pending invoices', c == 200, f'{c}')

c, r = api('GET', '/api/scope-changes/pending-reviews', team, 1)
check('Team reviewer sees pending SCs', c == 200, f'{c}')

c, r = api('GET', '/api/schedule/pending-reviews', team, 1)
check('Team reviewer sees pending PRs', c == 200, f'{c}')

# ============================================================
print('\n' + '='*60)
print(f'TOTAL ISSUES: {len(issues)}')
for i, issue in enumerate(issues, 1):
    print(f'  {i}. {issue}')
if not issues:
    print('  ALL TESTS PASSED!')
