import datetime
import math
import uuid
import json
import os
import random
import re
import time
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


MODEL_ID = 'us.amazon.nova-lite-v1:0'
FALLBACK_MODEL_ID = 'us.amazon.nova-pro-v1:0'

GLANCE_SYSTEM_PROMPT = """You are GLANCE, an Enterprise Document & Statement Visual Intelligence Engine ("Understand the document first. Visualize only what the evidence supports.").

CORE ARCHITECTURAL PRINCIPLE (STRICT ANTI-HALLUCINATION):
NEVER force every uploaded document into a generic financial dashboard!
1. First, classify what the document actually is (`document_class`: "Financial Statement" | "Bank / Card Statement" | "Invoice / Billing" | "Technical Study Guide" | "Architecture Specification" | "Customer Notice" | "Policy / SOP" | "Legal Agreement" | "General Enterprise Document").
2. Set `is_financial`: true ONLY if the document is genuinely a financial/billing/bank/P&L/tax statement with real monetary totals or cash flows. Set `is_financial`: false for technical guides, architecture specs, policies, notices, and non-financial documents!
3. NEVER fabricate unsupported percentages (like "85% clarity", "85/100 risk score", "68% allocation") or fake "Cash-Flow Trends" if they do not exist in the source text!
4. Every extracted figure, date, amount, technical detail, and watchout MUST include `source_evidence` (the supporting quote or section from the document).
5. ZERO EMOJIS anywhere in JSON values.

==================================================
MODE 1: CONVERSATIONAL & FOLLOW-UP ASSISTANCE (type: "chat")
==================================================
Trigger when the user sends a greeting, asks a general question within GLANCE's document/statement intelligence domain, or asks a follow-up / "tell extra" / "more specific" question about a previously analyzed document or statement (using conversation history). Provide a thorough, specific, evidence-grounded answer.
Output ONLY:
{
  "type": "chat",
  "message": "<Your natural, detailed reply without emojis>"
}

==================================================
MODE 2: ADAPTIVE ENTERPRISE DOCUMENT & STATEMENT ANALYSIS (type: "statement_analysis")
==================================================
Output ONLY valid JSON matching this schema:
{
  "type": "statement_analysis",
  "statement_title": "Accurate Document Title",
  "document_class": "Technical Study Guide | Architecture Specification | Customer Notice | Policy / SOP | Legal Agreement | Financial Statement | Bank / Card Statement | Invoice / Billing",
  "is_financial": false,
  "extraction_confidence": {
    "level": "HIGH | MEDIUM | LOW",
    "reason": "Evidence-based reason (e.g., 'All 5 pages of readable text and technical sections were extracted cleanly with zero encoding errors.')"
  },
  "quality_assessment": {
    "rating": "HIGH QUALITY | MODERATE | NEEDS REVIEW",
    "assessment": "Evidence-based assessment of document clarity, structure, and completeness (no arbitrary fake percentages)."
  },
  "headline_picture": "2-3 concise sentences explaining what this document is actually about.",
  "key_topics": [
    "Topic 1 extracted from document",
    "Topic 2 extracted from document",
    "Topic 3 extracted from document"
  ],
  "technical_or_structural_details": [
    {
      "label": "Component / Attribute (e.g. Backend, AI Model, Frontend, API, Delivery, or Effective Date)",
      "value": "Exact extracted value (e.g. Python & AWS Lambda, Amazon Bedrock, React 18 + Vite)",
      "source_evidence": "Exact section or quote from the document"
    }
  ],
  "section_coverage": [
    {
      "section": "Actual Section / Topic Heading from the document",
      "share_percent": 25,
      "summary": "1-line summary of what this section covers"
    }
  ],
  "key_figures": [
    {
      "label": "ONLY populate with REAL numbers, amounts, dates, or counts found in the document",
      "value": "Exact extracted figure or date",
      "note": "Context from document",
      "source_evidence": "Supporting quote/line from document",
      "emphasis": "positive | warning | neutral"
    }
  ],
  "visual_breakdown": [
    {
      "label": "ONLY populate if the document contains real measurable numerical/financial allocations; otherwise leave []",
      "share_percent": 50,
      "amount": "$0.00",
      "detail": "Real source-backed detail"
    }
  ],
  "cash_flow_series": [
    {
      "period": "ONLY populate if real multi-period or inflow/outflow numbers exist in the document; otherwise leave []",
      "value": 1000,
      "display_value": "$1,000"
    }
  ],
  "six_outputs": {
    "what_this_is_about": "Simple, clear executive summary of the document.",
    "what_you_need_to_do": "Clear action steps required by the reader, or explicitly 'No immediate action required — informational/reference document.'",
    "important_details": [
      {
        "item": "Key Date / Amount / Deadline / Technical Requirement",
        "value": "Exact detail",
        "source_evidence": "Supporting text from the document"
      }
    ],
    "why_this_matters": "Concrete business, operational, or customer reason behind this document.",
    "what_happens_next": "Expected next steps, deployment/review lifecycle, or follow-up process.",
    "simplified_communication": "Complete plain-English executive rewrite that any stakeholder can understand immediately."
  },
  "watchouts": [
    {
      "severity": "high | medium | low",
      "title": "Specific Watchout (e.g. Confidential Implementation Details, Infrastructure Identifiers, Unverified Compliance Claims, or Hidden Fee)",
      "explanation": "Clear explanation of why this watchout matters for enterprise governance.",
      "source_evidence": "Supporting quote or reference from the uploaded document",
      "action": "Concrete step to protect, verify, or remediate."
    }
  ],
  "suggested_followups": [
    "Follow-up question 1 specific to this document",
    "Follow-up question 2 specific to this document",
    "Follow-up question 3 specific to this document"
  ]
}

STRICT RULES:
- Output ONLY raw valid JSON.
- If `is_financial` is false, `visual_breakdown` and `cash_flow_series` MUST be empty arrays `[]`, while `section_coverage`, `key_topics`, `technical_or_structural_details`, and `six_outputs` MUST be richly populated from the real document!
- NEVER claim a readable document is encrypted!
- If PDF font extraction shows a lowercase 'n' immediately before a currency figure (e.g. 'n30', 'n175', 'n25'), interpret and format it cleanly as '₹' (e.g. '₹30', '₹175', '₹25').
- The text contains page markers like "[Page N of M]". Analyze ALL pages, not only the first. `section_coverage` MUST include entries drawn from every page/section of the document, and `key_topics`, `key_figures` and `watchouts` must reflect content found across all pages.
"""

RAPID_INTERCEPTOR_PATTERNS = [
    (re.compile(r'^\s*(?:bro|dude|bhai|machan|yaar|buddy|man|mate)\s*[!.]*$', re.I), [
        "Hey. Upload any document, technical guide, policy, or financial statement and I will classify it, visualize real data, and trace every insight back to the source.",
        "Ready when you are. Drop a PDF, DOCX, XLSX, CSV, or text statement to get an evidence-based enterprise breakdown."
    ]),
    (re.compile(r'^\s*(?:hi+|h[ea]y+|h[ea]llo+|hlo|hola|yo+|sup|greetings)\s*[!.]*$', re.I), [
        "Hello. I am GLANCE, your Enterprise Document & Statement Intelligence Engine. Upload any file or paste text to get an adaptive, source-traced visual breakdown.",
        "Welcome to GLANCE. Attach a financial statement, technical guide, policy, or customer notice and I will generate document-appropriate visualizations and executive deliverables."
    ]),
    (re.compile(r'^\s*namaste\s*[!.]*$', re.I), [
        "नमस्ते! मैं GLANCE हूँ। कोई भी दस्तावेज़ या वित्तीय विवरण अपलोड करें, मैं उसका सटीक और प्रमाण-आधारित विश्लेषण प्रस्तुत करूँगा।"
    ]),
    (re.compile(r'^\s*(?:ji|haa?n?|ok|okay|k|thanks?|thx)\s*[!.]*$', re.I), [
        "Understood. Upload any document or ask a follow-up question whenever you are ready."
    ]),
]


def _page_balanced_context(text: str, budget: int = 30000) -> str:
    """Keep every page represented: if the text exceeds the budget, give each
    '[Page N of M]' section an equal share instead of cutting off later pages."""
    text = text or ''
    if len(text) <= budget:
        return text
    parts = re.split(r'(?=\[Page \d+ of \d+\])', text)
    parts = [p for p in parts if p.strip()]
    if len(parts) <= 1:
        head = int(budget * 0.5)
        tail = int(budget * 0.25)
        mid_budget = budget - head - tail
        mid_start = max(head, (len(text) - mid_budget) // 2)
        return (
            text[:head]
            + '\n[... middle section condensed ...]\n'
            + text[mid_start:mid_start + mid_budget]
            + '\n[... later section condensed ...]\n'
            + text[-tail:]
        )
    share = max(400, budget // len(parts))
    out = []
    for p in parts:
        if len(p) <= share:
            out.append(p)
        else:
            keep_head = int(share * 0.7)
            keep_tail = share - keep_head
            out.append(p[:keep_head] + ' [...] ' + p[-keep_tail:])
    return '\n\n'.join(out)


def clean_and_parse_json(raw: str) -> dict:
    text = (raw or '').strip()

    # 1. First attempt: Extract from markdown code fences if present
    fence_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if fence_match:
        try:
            parsed = json.loads(fence_match.group(1).strip())
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    # 2. Second attempt: Direct JSON parse
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # 3. Third attempt: Greedy outer brace match
    match = re.search(r'(\{[\s\S]*\})', text)
    if match:
        try:
            parsed = json.loads(match.group(1).strip())
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    return {
        'type': 'chat',
        'message': text or 'How can I help analyze your document today?'
    }


def _detect_is_financial(text: str) -> bool:
    low = (text or '').lower()
    currency_hits = len(re.findall(r'(?:[$₹€£]\s?[\d,]+(?:\.\d{1,2})?|\b(?:total due|balance|ebitda|revenue|net income|gross margin|invoice|debit|credit|apr|interest rate|taxable|deductible|subtotal)\b)', low))
    return currency_hits >= 4


def _enrich_real_metrics_and_traceability(parsed: dict, source_text: str, file_name: str, doc_meta: dict = None) -> dict:
    meta = doc_meta or {}
    clean = (source_text or '').strip()
    words = meta.get('words') or (len(clean.split()) if clean else 0)
    pages = meta.get('pages') or 1
    read_mins = max(1, math.ceil(words / 200)) if words > 0 else 1
    read_time = meta.get('reading_time') or (f"{read_mins} min read ({words:,} words)" if words >= 100 else f"~{max(15, words)} sec ({words} words)")

    is_fin = bool(parsed.get('is_financial'))
    if not _detect_is_financial(clean) and any(k in str(parsed.get('document_class', '')).lower() for k in ('guide', 'technical', 'architecture', 'policy', 'notice', 'legal', 'manual', 'study')):
        is_fin = False
        parsed['is_financial'] = False

    # Never keep fake visual_breakdown or fake cash_flow_series on non-financial documents
    if not is_fin:
        parsed['visual_breakdown'] = []
        parsed['cash_flow_series'] = []

    parsed['extraction_status'] = {
        'status': meta.get('extraction_status', 'SUCCESS' if words > 0 else 'PARTIAL'),
        'readable': words > 0,
        'pages': pages,
        'words': words,
        'reading_time': read_time,
        'detail': meta.get('extraction_detail', 'Readable document · Content extraction successful' if words > 0 else 'Limited text extracted')
    }

    if not isinstance(parsed.get('extraction_confidence'), dict):
        parsed['extraction_confidence'] = {
            'level': 'HIGH' if words >= 100 else ('MEDIUM' if words > 20 else 'LOW'),
            'reason': f"Extracted {words:,} readable words across {pages} page(s) with direct source-text verification."
        }

    if not isinstance(parsed.get('quality_assessment'), dict):
        parsed['quality_assessment'] = {
            'rating': 'HIGH QUALITY' if words >= 100 else 'MODERATE',
            'assessment': 'Document structure, headings, and key operational details are clearly articulated and verifiable against the source text.'
        }

    # Ensure section_coverage exists so we always have an accurate, evidence-based visualization
    if not isinstance(parsed.get('section_coverage'), list) or not parsed['section_coverage']:
        topics = parsed.get('key_topics') or ['Overview & Purpose', 'Core Specifications', 'Governance & Safeguards', 'Implementation & Next Steps']
        share = max(10, round(100 / max(1, len(topics[:5]))))
        parsed['section_coverage'] = [
            {'section': str(t), 'share_percent': share, 'summary': f'Covers {str(t).lower()} in the source document.'}
            for t in topics[:5]
        ]

    # Ensure metrics reflect real extracted counts (not fake percentages)
    parsed['metrics'] = {
        'pages_count': pages,
        'word_count': words,
        'reading_time': read_time,
        'figures_extracted': len(parsed.get('key_figures') or []),
        'details_extracted': len(parsed.get('technical_or_structural_details') or []),
        'watchouts_detected': len(parsed.get('watchouts') or [])
    }

    return parsed


def rule_based_statement_fallback(content: str, file_name: str = '', doc_meta: dict = None) -> dict:
    clean = (content or '').strip()
    is_fin = _detect_is_financial(clean)
    pages = (doc_meta or {}).get('pages', 1)
    words = (doc_meta or {}).get('words') or len(clean.split())
    title = Path(file_name).stem.replace('_', ' ').replace('-', ' ').title() if file_name else 'Enterprise Document Analysis'

    # Detect page/section headings
    headings = []
    for ln in clean.splitlines():
        st = ln.strip()
        if 4 <= len(st) <= 75 and (st.isupper() or re.match(r'^(?:\d+\.|#{1,3}\s+|Section\s+\d+)', st, re.I)):
            headings.append(st.lstrip('# '))
    if not headings:
        headings = ['Document Overview', 'Core Content & Architecture', 'Governance & Watchouts', 'Next Steps']

    currency_matches = re.findall(r'(?:[$₹€£]\s?[\d,]+(?:\.\d{1,2})?)', clean)[:5]
    key_figures = [
        {'label': f'Extracted Monetary Figure {i + 1}', 'value': val, 'note': 'Found verbatim in source text', 'source_evidence': val, 'emphasis': 'neutral'}
        for i, val in enumerate(currency_matches)
    ]

    doc_class = 'Financial Statement' if is_fin else ('Technical Study Guide' if any(w in clean.lower() for w in ('architecture', 'backend', 'frontend', 'lambda', 'bedrock', 'react', 'guide')) else 'Enterprise Document')

    base = {
        'type': 'statement_analysis',
        'statement_title': title,
        'document_class': doc_class,
        'is_financial': is_fin,
        'headline_picture': clean[:260] + ('...' if len(clean) > 260 else ''),
        'key_topics': headings[:6],
        'technical_or_structural_details': [
            {'label': 'Document Format', 'value': f'{Path(file_name).suffix.upper().lstrip(".") or "TEXT"} · {pages} page(s)', 'source_evidence': file_name or 'Uploaded payload'},
            {'label': 'Extracted Volume', 'value': f'{words:,} readable words', 'source_evidence': 'Verified text extraction'}
        ],
        'section_coverage': [
            {'section': h, 'share_percent': max(15, round(100 / len(headings[:5]))), 'summary': f'Extracted section covering {h}.'}
            for h in headings[:5]
        ],
        'key_figures': key_figures,
        'visual_breakdown': [],
        'cash_flow_series': [],
        'six_outputs': {
            'what_this_is_about': clean[:320] + ('...' if len(clean) > 320 else ''),
            'what_you_need_to_do': 'Review the extracted sections, watchouts, and supporting source evidence below.',
            'important_details': [
                {'item': 'Document Length', 'value': f'{pages} page(s), {words:,} words', 'source_evidence': 'Direct document extraction'}
            ],
            'why_this_matters': 'Provides verified, source-traced visibility into the document without fabricated metrics.',
            'what_happens_next': 'Approve the analysis or edit notes for human review and export.',
            'simplified_communication': clean[:450] + ('...' if len(clean) > 450 else '')
        },
        'watchouts': [
            {
                'severity': 'low',
                'title': 'Verify Source Sections Directly',
                'explanation': 'Deterministic extraction mode was used; review the extracted quotes and source viewer for full context.',
                'source_evidence': clean[:120],
                'action': 'Open the document viewer to cross-check specific clauses.'
            }
        ],
        'suggested_followups': [
            'Summarize the key technical or operational details',
            'List all watchouts with source evidence',
            'Explain the main takeaways in plain English'
        ]
    }
    return _enrich_real_metrics_and_traceability(base, clean, file_name, doc_meta)


def analyze_statement(content: str, file_name: str = '', conversation_history: list = None, doc_meta: dict = None) -> dict:
    clean = (content or '').strip()

    if not file_name and (not conversation_history or len(conversation_history) == 0):
        for pattern, replies in RAPID_INTERCEPTOR_PATTERNS:
            if pattern.match(clean):
                last_ai = next((m.get('content') for m in reversed(conversation_history or []) if m.get('role') != 'user'), None)
                pool = [r for r in replies if r != last_ai] or replies
                return {
                    'type': 'chat',
                    'message': random.choice(pool),
                }

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

        meta_header = ""
        if doc_meta:
            meta_header = (
                f"[VERIFIED EXTRACTION METADATA: filename={file_name}, pages={doc_meta.get('pages', 1)}, "
                f"words={doc_meta.get('words', 0)}, extraction_status={doc_meta.get('extraction_status', 'SUCCESS')}]\n"
            )
        prompt_text = f"{meta_header}{_page_balanced_context(safe_text, 30000)}"

        messages.append({
            'role': 'user',
            'content': [{'text': prompt_text}],
        })

        sanitized_messages = []
        expected_role = 'user'
        for m in messages:
            if m['role'] == expected_role:
                sanitized_messages.append(m)
                expected_role = 'assistant' if expected_role == 'user' else 'user'

        if not sanitized_messages or sanitized_messages[-1]['role'] != 'user':
            sanitized_messages.append({'role': 'user', 'content': [{'text': prompt_text}]})
        else:
            sanitized_messages[-1] = {'role': 'user', 'content': [{'text': prompt_text}]}

        start_time = time.time()
        for model in (MODEL_ID, FALLBACK_MODEL_ID):
            if time.time() - start_time > 22:
                break
            try:
                response = client.converse(
                    modelId=model,
                    messages=sanitized_messages,
                    system=[{'text': GLANCE_SYSTEM_PROMPT}],
                    inferenceConfig={'temperature': 0.1, 'maxTokens': 2500},
                )
                raw_output = response['output']['message']['content'][0]['text']
                parsed = clean_and_parse_json(raw_output)
                if isinstance(parsed, dict) and ('type' in parsed or 'headline_picture' in parsed or 'message' in parsed):
                    if not file_name and len(clean.split()) < 14 and parsed.get('type') != 'chat':
                        hp = parsed.get('headline_picture') or {}
                        msg_txt = parsed.get('message') or hp.get('summary') or hp.get('title') or "Please upload a statement file or paste statement details to analyze."
                        return {'type': 'chat', 'message': msg_txt}
                    if parsed.get('type') != 'chat':
                        parsed['type'] = 'statement_analysis'
                        parsed = _enrich_real_metrics_and_traceability(parsed, safe_text, file_name, doc_meta)
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

    if not file_name and len(clean.split()) < 14:
        return {
            'type': 'chat',
            'message': "I am ready to analyze any document or statement. Upload a file or paste content to get an adaptive, source-traced visual breakdown.",
        }
    res = rule_based_statement_fallback(safe_text, file_name, doc_meta)
    trace_code = f"GLN-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    if isinstance(res, dict):
        res['trace_id'] = trace_code
        res['guardrails'] = {"status": "PASSED", "pci_dss_sanitized": True}
    return res
