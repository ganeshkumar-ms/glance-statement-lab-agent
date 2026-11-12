import json
import sys
import time
import urllib.error
import urllib.request
import uuid

CF_URL = ''
API_URL = ''
for idx, arg in enumerate(sys.argv[1:], 1):
    if arg == '--cf' and idx < len(sys.argv) - 1:
        CF_URL = sys.argv[idx + 1]
    elif arg == '--api' and idx < len(sys.argv) - 1:
        API_URL = sys.argv[idx + 1]
if not CF_URL and not API_URL:
    CF_URL = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != 'skip' else ''
    API_URL = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != 'skip' else ''


def _multipart_request(url: str, fields: dict, file_field: tuple = None, timeout: int = 30):
    boundary = f'----GlanceBoundary{uuid.uuid4().hex}'
    parts = []
    for k, v in fields.items():
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode('utf-8')
        )
    if file_field:
        fname, fbytes, ctype = file_field
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{fname}"\r\nContent-Type: {ctype}\r\n\r\n'.encode('utf-8')
            + fbytes + b'\r\n'
        )
    parts.append(f'--{boundary}--\r\n'.encode('utf-8'))
    body = b''.join(parts)
    req = urllib.request.Request(
        url,
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))


def run_tests(base_url: str, label: str):
    print(f'\n--- Testing {label}: {base_url} ---')
    # 1. Health
    with urllib.request.urlopen(f'{base_url}/api/health', timeout=15) as r:
        health = json.loads(r.read().decode('utf-8'))
        assert health['status'] == 'ok' and health['agent'] == 'GLANCE', health
        print('  [1/6] /api/health PASS:', health['agent'], health['eyebrow'])

    # 2. Varied Greetings
    replies = set()
    for _ in range(3):
        st, d = _multipart_request(f'{base_url}/api/analyze', {'text': 'hi', 'conversation_history': '[]'})
        assert st == 200 and d['type'] == 'chat' and d['message'], d
        replies.add(d['message'])
    print(f'  [2/6] Greetings PASS (varied replies seen: {len(replies)}):', list(replies)[:2])

    # 3. Casual Multilingual / Slang Chat
    st, d = _multipart_request(
        f'{base_url}/api/analyze',
        {'text': 'bro explain what EBITDA margin means simply', 'conversation_history': '[]'},
    )
    assert st == 200 and d['type'] == 'chat' and len(d.get('message', '')) > 20, d
    print('  [3/6] Conversational Mode 1 PASS:', d['message'][:90])

    # 4. Dense Statement Text Analysis (Mode 2)
    stmt = (
        "Quarterly Corporate Operating Statement Q3 2026: "
        "Gross Revenue $480,000; Cloud Infrastructure & Hosting $96,000; "
        "Payroll & Engineering $210,000; Sales & Marketing $62,000; "
        "Late Settlement Penalty Clause 4.2 imposes 2.5% monthly surcharge past Net-30; "
        "Net Operating Income $112,000."
    )
    st, d = _multipart_request(f'{base_url}/api/analyze', {'text': stmt, 'conversation_history': '[]'})
    assert st == 200 and d.get('type') == 'statement_analysis', d
    assert d.get('clarity_score', 0) > 0 and d.get('headline_picture'), d
    assert isinstance(d.get('key_figures'), list) and len(d['key_figures']) >= 2, d
    assert isinstance(d.get('visual_breakdown'), list) and len(d['visual_breakdown']) >= 1, d
    print('  [4/6] Statement Analysis Mode 2 PASS:', d.get('statement_title'), f"Score={d.get('clarity_score')}")

    # 5. File Upload + Document Viewer Endpoint
    csv_bytes = (
        b"Category,Amount,Share\n"
        b"Fixed Cloud Spend,42000,35%\n"
        b"Vendor Licensing,54000,45%\n"
        b"Overdraft & Wire Fees,24000,20%\n"
    )
    st, d = _multipart_request(
        f'{base_url}/api/analyze',
        {'text': '', 'conversation_history': '[]'},
        file_field=('q3_bank_statement.csv', csv_bytes, 'text/csv'),
    )
    assert st == 200 and d.get('type') == 'statement_analysis' and d.get('document'), d
    view_url = d['document']['view_url']
    with urllib.request.urlopen(f'{base_url}{view_url}', timeout=15) as vr:
        html_doc = vr.read().decode('utf-8')
        assert vr.status == 200 and 'GLANCE STATEMENT SOURCE' in html_doc and 'Vendor Licensing' in html_doc
    print('  [5/6] File Upload + Document Viewer PASS:', d['document']['filename'])

    # 6. Multi-Turn Follow-up Conversation
    hist = json.dumps([
        {'role': 'user', 'content': stmt},
        {'role': 'ai', 'content': d.get('headline_picture', '')},
    ])
    st, d2 = _multipart_request(
        f'{base_url}/api/analyze',
        {'text': 'hi', 'conversation_history': hist},
    )
    assert st == 200 and (d2.get('message') or d2.get('headline_picture')), d2
    print('  [6/6] Multi-turn context PASS:', (d2.get('message') or d2.get('headline_picture'))[:80])


if __name__ == '__main__':
    if API_URL:
        run_tests(API_URL.rstrip('/'), 'API Gateway')
    if CF_URL:
        with urllib.request.urlopen(CF_URL.rstrip('/'), timeout=15) as resp:
            assert resp.status == 200 and 'GLANCE' in resp.read().decode('utf-8')
        print('\nCloudFront root HTML HTTP 200 PASS')
        run_tests(CF_URL.rstrip('/'), 'CloudFront End-to-End')
    print('\nALL GLANCE TESTS PASSED!')

