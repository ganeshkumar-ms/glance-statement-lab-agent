import datetime
import uuid
import json
import os
import random
import re
from pathlib import Path
import boto3
from services import guardrail_service

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / '.env')
    load_dotenv()
except ImportError:
    pass


def get_bedrock_client():
    return boto3.client(
        'bedrock-runtime',
        region_name=os.getenv('AWS_DEFAULT_REGION') or os.getenv('AWS_REGION') or 'us-east-1',
    )


MODEL_ID = 'us.amazon.nova-pro-v1:0'
FALLBACK_MODEL_ID = 'us.anthropic.claude-3-haiku-20240307-v1:0'

GLANCE_SYSTEM_PROMPT = """You are GLANCE, an Enterprise Interactive Statement Lab & Visual Clarity AI ("Complex statement. Clear picture.").
Your mission is to transform dense financial statements, bank or credit card statements, P&L / balance sheets, tax/billing statements, insurance disclosures, or complex multi-clause statements into a crystal-clear interactive picture: headline takeaway, key extracted figures, proportional visual breakdowns, plain-English translations, watchouts/flags, and smart follow-up actions.

You operate dynamically in TWO MODES based on user input:

==================================================
MODE 1: CONVERSATIONAL & MULTILINGUAL ASSISTANCE (type: "chat")
==================================================
Trigger this mode whenever:
- The user sends greetings, casual slang ("bro", "dude", "bhai", "machan", "yaar", "buddy"), checks in, asks how you are doing, or chats conversationally.
- The user speaks in ANY language (English, Tamil, Hindi, Telugu, Spanish, French, etc.) conversationally or asks a general concept question (e.g., "What is EBITDA?", "How do I spot hidden bank fees?", "Summarize what we found earlier").
- The user asks a follow-up question about a previously analyzed statement without requesting a full new statement breakdown card.

RULE FOR MODE 1:
- Reply smoothly, clearly, warmly, and naturally in the user's language and tone.
- NEVER emit a broken or empty statement card for casual chat or general questions.
- Output ONLY this JSON format:
{
  "type": "chat",
  "message": "<Your clear, helpful conversational reply in the user's language>"
}

==================================================
MODE 2: INTERACTIVE STATEMENT BREAKDOWN (type: "statement_analysis")
==================================================
Trigger this mode whenever:
- The user has attached/uploaded a file (PDF, DOCX, XLSX, CSV, JSON, XML, TXT, MD).
- The user pastes or provides any financial, banking, billing, tax, invoice, policy, legal, or multi-clause statement to simplify, audit, or visualize.

DELIVERABLES FOR MODE 2:
Return ONLY valid JSON with this exact schema:
{
  "type": "statement_analysis",
  "statement_title": "Concise 3-6 word topic title (e.g., 'Q3 Corporate P&L Statement')",
  "statement_category": "Financial Statement | Bank / Card Statement | Invoice / Billing | Tax / Audit Disclosure | Policy / Legal Statement | Executive Statement",
  "clarity_score": 90,
  "clarity_status": "CRYSTAL_CLEAR" | "NEEDS_ATTENTION" | "COMPLEX_WATCHOUT",
  "risk_level": "Low" | "Moderate" | "Elevated" | "High",
  "headline_picture": "2 concise sentences giving the unmistakable bottom-line picture of this statement.",
  "metrics": {
    "figures_extracted": 6,
    "clauses_simplified": 4,
    "flags_detected": 2,
    "reading_time": "45 sec"
  },
  "key_figures": [
    {
      "label": "Metric or Line Item Name",
      "value": "$124,500 (or exact figure / term)",
      "note": "Brief context or comparison",
      "emphasis": "positive" | "warning" | "neutral"
    }
  ],
  "visual_breakdown": [
    {
      "label": "Category / Allocation Bucket",
      "share_percent": 48,
      "amount": "$59,760",
      "detail": "Short 1-line explanation"
    }
  ],
  "plain_english": [
    {
      "section": "Clause / Line Item Title",
      "clear_meaning": "Simple plain-English explanation anyone can grasp immediately.",
      "takeaway": "Why it matters or what action it triggers."
    }
  ],
  "watchouts": [
    {
      "severity": "high" | "medium" | "low",
      "title": "Hidden Fee / Deadline / Discrepancy / Obligation",
      "impact": "Concrete financial or compliance impact.",
      "action": "Recommended step to verify, dispute, or optimize."
    }
  ],
  "next_actions": [
    "Actionable step 1",
    "Actionable step 2"
  ],
  "suggested_followups": [
    "Explain the biggest cost driver",
    "Are there any hidden fees or penalties?",
    "Compare cash flow vs net margin"
  ]
}

STRICT RULES:
- Output ONLY raw valid JSON (no markdown code fences, no extra prose).
- All arrays must stay concise and accurate (3-6 key_figures, 3-5 visual_breakdown items whose shares are integers 0..100, 3-5 plain_english items, 1-4 watchouts).
- Base every figure strictly on the provided text/document. Do NOT fabricate numbers that contradict the source; if numeric totals aren't present (e.g., policy/legal statement), allocate visual_breakdown cleanly by clause weight/obligation share or omit unnecessary amounts cleanly."""


RAPID_INTERCEPTOR_PATTERNS = [
    (re.compile(r'^\s*(?:bro|dude|bhai|machan|yaar|buddy|man|mate)\s*[!.]*$', re.I), [
        "Hey! Drop in any dense financial, bank, or policy statement and I'll turn it into a crystal-clear visual picture.",
        "Hey there! Got a tricky statement or bill to break down today? Paste it or attach a file anytime.",
        "What's up! Share a statement, report, or question and I'll simplify every detail for you."
    ]),
    (re.compile(r'^\s*(?:hi+|h[ea]y+|h[ea]llo+|hlo|hola|yo+|sup|greetings)\s*[!.]*$', re.I), [
        "Hello! I'm GLANCE, your Interactive Statement Lab. Share any statement or file and I'll turn complexity into clarity.",
        "Hey! Ready whenever you are — paste a statement or upload a PDF, CSV, XLSX, or DOCX to see the clear picture.",
        "Hi there! Looking to break down a bank statement, P&L report, invoice, or dense disclosure? Drop it in!",
        "Hello! Send over any complex statement or ask a question — let's make sense of the numbers and fine print."
    ]),
    (re.compile(r'^\s*namaste\s*[!.]*$', re.I), [
        "नमस्ते! मैं GLANCE हूँ। कोई भी वित्तीय विवरण, बिल या जटिल दस्तावेज़ साझा करें, मैं उसे सरल और स्पष्ट रूप में समझा दूंगा।",
        "नमस्ते! आज किस स्टेटमेंट या रिपोर्ट को आसान भाषा में समझना चाहते हैं? फ़ाइल अपलोड करें या टेक्स्ट लिखें।"
    ]),
    (re.compile(r'^\s*(?:ji|haa?n?|ok|okay|k|thanks?|thx)\s*[!.]*$', re.I), [
        "Got it! Whenever you're ready, share a statement or ask any follow-up question.",
        "Sure thing! Paste a statement or attach a file whenever you want a visual breakdown."
    ]),
]


def clean_and_parse_json(raw: str) -> dict:
    text = (raw or '').strip()
    text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\s*```$', '', text, flags=re.MULTILINE).strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r'(\{[\s\S]*\})', text)
    if match:
        try:
            parsed = json.loads(match.group(1))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    return {
        'type': 'chat',
        'message': text or 'How can I help clarify your statement today?'
    }


def _extract_currency_candidates(text: str) -> list:
    matches = re.findall(r'(?:[$₹€£]\s?[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s?%)', text)
    seen = []
    for m in matches:
        clean = m.strip()
        if clean not in seen:
            seen.append(clean)
        if len(seen) >= 4:
            break
    return seen


def rule_based_statement_fallback(content: str, file_name: str = '') -> dict:
    """Deterministic fallback when Bedrock cannot be reached."""
    clean = (content or '').strip()
    first_line = next((ln.strip() for ln in clean.splitlines() if ln.strip()), 'Statement Overview')[:60]
    nums = _extract_currency_candidates(clean)
    key_figures = [
        {
            'label': f'Extracted Figure {idx + 1}',
            'value': val,
            'note': 'Detected directly in source statement',
            'emphasis': 'neutral',
        }
        for idx, val in enumerate(nums)
    ] or [
        {
            'label': 'Source Length',
            'value': f'{len(clean.split())} words',
            'note': file_name or 'Submitted statement text',
            'emphasis': 'neutral',
        }
    ]

    return {
        'type': 'statement_analysis',
        'statement_title': Path(file_name).stem.replace('_', ' ').replace('-', ' ').title() if file_name else (first_line or 'Statement Clarification'),
        'statement_category': 'Interactive Statement',
        'clarity_score': 86,
        'clarity_status': 'CRYSTAL_CLEAR',
        'risk_level': 'Low',
        'headline_picture': f'Source statement ({len(clean.split())} words) structured into key metrics, plain-English sections, and action items.',
        'metrics': {
            'figures_extracted': len(key_figures),
            'clauses_simplified': 2,
            'flags_detected': 1,
            'reading_time': '30 sec',
        },
        'key_figures': key_figures,
        'visual_breakdown': [
            {'label': 'Core Statement Content', 'share_percent': 65, 'amount': nums[0] if nums else 'Primary', 'detail': 'Primary obligations, balances, and line items'},
            {'label': 'Terms & Disclosures', 'share_percent': 35, 'amount': nums[1] if len(nums) > 1 else 'Secondary', 'detail': 'Supporting conditions and notes'},
        ],
        'plain_english': [
            {
                'section': 'Executive Overview',
                'clear_meaning': clean[:220] + ('...' if len(clean) > 220 else ''),
                'takeaway': 'Review extracted numbers and key deadlines closely before signing or paying.',
            }
        ],
        'watchouts': [
            {
                'severity': 'low',
                'title': 'Verify Supporting Line Items',
                'impact': 'Live AI deep-parse fell back to deterministic summary; check source figures directly.',
                'action': 'Ask a follow-up question on any specific figure or clause.',
            }
        ],
        'next_actions': [
            'Verify the headline totals against the original source lines.',
            'Ask GLANCE to explain any unclear fee, tax line, or clause.',
        ],
        'suggested_followups': [
            'Explain the biggest line item in simple terms',
            'Spot any hidden fees or penalties',
            'Summarize action items and due dates',
        ],
    }


def analyze_statement(content: str, file_name: str = '', conversation_history: list = None) -> dict:
    """Core dual-mode statement clarity engine powered by AWS Bedrock Nova Pro."""
    clean = (content or '').strip()

    # 1. Rapid greeting / check-in interceptor (only on initial greeting or without file)
    if not file_name and (not conversation_history or len(conversation_history) == 0):
        for pattern, replies in RAPID_INTERCEPTOR_PATTERNS:
            if pattern.match(clean):
                last_ai = next((m.get('content') for m in reversed(conversation_history or []) if m.get('role') != 'user'), None)
                pool = [r for r in replies if r != last_ai] or replies
                return {
                    'type': 'chat',
                    'message': random.choice(pool),
                }

    # 2. Sanitize PII & prompt injections
    sanitized_res = guardrail_service.sanitize_input(clean)
    if sanitized_res.get('blocked'):
        trace_code = f"GLN-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        return {
            'type': 'chat',
            'message': sanitized_res.get('message', 'Content rejected by Enterprise BFSI Security Guardrails.'),
            'guardrail_status': 'BLOCKED',
            'guardrails': sanitized_res.get('guardrails', {"status": "BLOCKED"}),
            'rejected': True,
            'trace_id': trace_code,
            'data': {
                'trace_id': trace_code,
                'guardrails': sanitized_res.get('guardrails', {"status": "BLOCKED"})
            }
        }
    safe_text = sanitized_res['text']

    # 3. Call Amazon Bedrock Converse API
    try:
        client = get_bedrock_client()

        messages = []
        if conversation_history:
            for item in conversation_history[-6:]:
                role = 'user' if item.get('role') == 'user' else 'assistant'
                txt = (item.get('content') or '').strip()
                if txt:
                    messages.append({
                        'role': role,
                        'content': [{'text': txt[:1500]}],
                    })

        prompt_text = safe_text
        if file_name:
            prompt_text = f"[ATTACHED STATEMENT FILE: {file_name}]\n{prompt_text}"

        messages.append({
            'role': 'user',
            'content': [{'text': prompt_text}],
        })

        # Ensure strict user -> assistant -> user alternation ending with user
        sanitized_messages = []
        expected_role = 'user'
        for m in messages:
            if m['role'] == expected_role:
                sanitized_messages.append(m)
                expected_role = 'assistant' if expected_role == 'user' else 'user'

        # Guarantee the final message is ALWAYS our current user prompt
        if not sanitized_messages or sanitized_messages[-1]['role'] != 'user':
            sanitized_messages.append({
                'role': 'user',
                'content': [{'text': prompt_text}],
            })
        else:
            sanitized_messages[-1] = {
                'role': 'user',
                'content': [{'text': prompt_text}],
            }

        for model in (MODEL_ID, FALLBACK_MODEL_ID):
            try:
                response = client.converse(
                    modelId=model,
                    messages=sanitized_messages,
                    system=[{'text': GLANCE_SYSTEM_PROMPT}],
                    inferenceConfig={'temperature': 0.2, 'maxTokens': 3000},
                )
                raw_output = response['output']['message']['content'][0]['text']
                parsed = clean_and_parse_json(raw_output)
                if isinstance(parsed, dict) and ('type' in parsed or 'headline_picture' in parsed or 'message' in parsed):
                    trace_code = f"GLN-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
                    parsed['trace_id'] = trace_code
                    parsed['guardrails'] = {
                        "status": "REDACTED" if sanitized_res.get("pii_detected") else "PASSED",
                        "pci_dss_sanitized": True,
                        "redacted_count": sanitized_res.get("guardrails", {}).get("redacted_count", 0),
                        "redacted_types": sanitized_res.get("guardrails", {}).get("redacted_types", []),
                    }
                    return parsed
            except Exception as e:
                print(f"Bedrock Converse ({model}) warning: {e}")

    except Exception as e:
        print(f"Bedrock invocation exception: {e}")

    # 4. Deterministic fallback if Bedrock was unavailable
    if not file_name and len(clean.split()) < 14:
        return {
            'type': 'chat',
            'message': "I'm ready to clarify any statement or answer your questions. Paste a financial, bank, billing, or policy statement—or attach a document—and I'll break it down clearly.",
        }
    res = rule_based_statement_fallback(safe_text, file_name)
    trace_code = f"GLN-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    if isinstance(res, dict):
        res['trace_id'] = trace_code
        res['guardrails'] = {"status": "PASSED", "pci_dss_sanitized": True}
    return res

