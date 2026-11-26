import csv
import io
import json
import math
import re
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path


def _extract_docx_stdlib(content_bytes: bytes) -> str:
    """Pure-stdlib DOCX extractor safe in Lambda without python-docx."""
    try:
        with zipfile.ZipFile(io.BytesIO(content_bytes)) as z:
            parts = []
            for name in ('word/document.xml', 'word/header1.xml', 'word/footer1.xml'):
                if name not in z.namelist():
                    continue
                root = ET.fromstring(z.read(name))
                paragraphs = []
                for p in root.iter():
                    if p.tag.endswith('}p'):
                        texts = [t.text for t in p.iter() if t.tag.endswith('}t') and t.text]
                        if texts:
                            paragraphs.append(''.join(texts))
                if paragraphs:
                    parts.append('\n'.join(paragraphs))
            return '\n\n'.join(parts).strip()
    except Exception:
        return ''


def _extract_xlsx_stdlib(content_bytes: bytes) -> str:
    """Pure-stdlib XLSX extractor safe in Lambda without openpyxl."""
    try:
        with zipfile.ZipFile(io.BytesIO(content_bytes)) as z:
            shared = []
            if 'xl/sharedStrings.xml' in z.namelist():
                sroot = ET.fromstring(z.read('xl/sharedStrings.xml'))
                for si in sroot.iter():
                    if si.tag.endswith('}si'):
                        parts = [t.text for t in si.iter() if t.tag.endswith('}t') and t.text]
                        shared.append(''.join(parts))

            lines = []
            sheet_names = sorted(
                n for n in z.namelist()
                if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')
            )
            for sname in sheet_names[:5]:
                lines.append(f'Sheet: {Path(sname).stem}')
                wroot = ET.fromstring(z.read(sname))
                row_count = 0
                for row in wroot.iter():
                    if row.tag.endswith('}row'):
                        row_vals = []
                        for c in row:
                            t_attr = c.attrib.get('t')
                            val_text = ''
                            for child in c:
                                if child.tag.endswith('}v') and child.text is not None:
                                    val_text = child.text
                                elif child.tag.endswith('}is'):
                                    val_text = ''.join(x.text for x in child.iter() if x.tag.endswith('}t') and x.text)
                            if t_attr == 's' and val_text.isdigit():
                                idx = int(val_text)
                                val_text = shared[idx] if idx < len(shared) else val_text
                            if val_text:
                                row_vals.append(val_text)
                        if row_vals:
                            lines.append(' | '.join(row_vals))
                            row_count += 1
                        if row_count >= 120:
                            break
            return '\n'.join(lines).strip()
    except Exception:
        return ''


def _count_pdf_pages_stdlib(content_bytes: bytes) -> int:
    try:
        matches = re.findall(rb'/Type\s*/Page\b', content_bytes)
        return max(1, len(matches))
    except Exception:
        return 1


def _extract_pdf_with_bedrock(content_bytes: bytes) -> str:
    if len(content_bytes) == 0 or len(content_bytes) > 4_500_000:
        return ''
    try:
        import boto3, os
        region = os.getenv('AWS_DEFAULT_REGION') or os.getenv('AWS_REGION') or 'us-east-1'
        br = boto3.client('bedrock-runtime', region_name=region)
        res = br.converse(
            modelId='us.amazon.nova-pro-v1:0',
            messages=[{
                'role': 'user',
                'content': [
                    {'document': {'format': 'pdf', 'name': 'uploaded_statement', 'source': {'bytes': content_bytes}}},
                    {'text': 'Read ALL pages of this PDF from start to finish and transcribe all headings, text, tables, dates, figures, and technical details verbatim.'}
                ]
            }],
            inferenceConfig={'maxTokens': 6000, 'temperature': 0.0}
        )
        return res['output']['message']['content'][0]['text'].strip()
    except Exception:
        return ''


def _extract_pdf_stdlib(content_bytes: bytes) -> str:
    """Pure-stdlib PDF text extractor supporting /ASCII85Decode + /FlateDecode, /FlateDecode, and raw streams."""
    import base64
    chunks = []
    stream_pattern = re.compile(rb'stream\r?\n(.*?)endstream', re.S)
    for match in stream_pattern.finditer(content_bytes):
        data = match.group(1).rstrip(b'\r\n')
        decoded = data
        # 1. Decode Adobe ASCII85 (~> terminator) if present
        stripped = decoded.strip()
        if b'~>' in stripped:
            try:
                decoded = base64.a85decode(stripped, adobe=True)
            except Exception:
                try:
                    decoded = base64.a85decode(stripped.split(b'~>', 1)[0] + b'~>', adobe=True)
                except Exception:
                    pass
        # 2. Decompress FlateDecode (zlib) if compressed
        try:
            decoded = zlib.decompress(decoded)
        except Exception:
            pass
        text_str = decoded.decode('latin-1', errors='ignore')
        for paren in re.findall(r'\(([^()]*)\)', text_str):
            cleaned = paren.replace(r'\(', '(').replace(r'\)', ')').replace(r'\\', '\\').strip()
            if cleaned and any(ch.isalnum() for ch in cleaned):
                chunks.append(cleaned)
    if not chunks:
        raw = content_bytes.decode('latin-1', errors='ignore')
        for m in re.findall(r'\(([^()]{2,200})\)', raw):
            cleaned = m.replace(r'\(', '(').replace(r'\)', ')').strip()
            if cleaned and sum(ch.isalnum() or ch.isspace() for ch in cleaned) >= len(cleaned) * 0.65:
                if any(ch.isalpha() for ch in cleaned):
                    chunks.append(cleaned)
    joined = ' '.join(chunks).strip()
    return re.sub(r'\s+', ' ', joined)



def extract_document(filename: str, content_bytes: bytes) -> dict:
    """Extracts text and accurate metadata from uploaded documents (PDF, DOCX, XLSX, CSV, JSON, XML, HTML, TXT, MD)."""
    ext = Path(filename or '').suffix.lower()
    text = ''
    detected_type = 'text/plain'
    pages_count = 1
    extraction_status = 'SUCCESS'
    extraction_detail = 'Content extraction successful'

    try:
        if ext in ('.txt', '.md', '.markdown', '.sql', '.html', '.htm', '.yaml', '.yml', '.log'):
            text = content_bytes.decode('utf-8', errors='replace')
            detected_type = 'text/markdown' if ext in ('.md', '.markdown') else 'text/plain'

        elif ext == '.json':
            detected_type = 'application/json'
            raw_txt = content_bytes.decode('utf-8', errors='replace')
            try:
                parsed = json.loads(raw_txt)
                text = json.dumps(parsed, indent=2)
            except Exception:
                text = raw_txt

        elif ext == '.csv':
            detected_type = 'text/csv'
            decoded = content_bytes.decode('utf-8', errors='replace')
            reader = csv.reader(io.StringIO(decoded))
            rows = list(reader)
            if rows:
                header = rows[0]
                text = f"CSV Header: {', '.join(header)}\nTotal Rows: {len(rows)}\nData Rows:\n"
                for row in rows[:80]:
                    text += f"- {', '.join(row)}\n"
            else:
                text = decoded

        elif ext == '.xml':
            detected_type = 'application/xml'
            decoded = content_bytes.decode('utf-8', errors='replace')
            try:
                root = ET.fromstring(decoded)
                text = f'Root Tag: {root.tag}\n' + ' '.join(t.strip() for t in root.itertext() if t.strip())[:15000]
            except Exception:
                text = decoded

        elif ext == '.pdf':
            detected_type = 'application/pdf'
            pages_count = _count_pdf_pages_stdlib(content_bytes)
            # 1. Try pdfplumber first (most accurate for multi-page technical & financial PDFs)
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(content_bytes)) as pdf:
                    pages_count = len(pdf.pages)
                    page_texts = []
                    for i, page in enumerate(pdf.pages):
                        pt = (page.extract_text() or '').strip()
                        if pt:
                            page_texts.append(f"[Page {i + 1} of {pages_count}]\n{pt}")
                    text = '\n\n'.join(page_texts).strip()
            except Exception:
                text = ''

            # 2. Try pypdf if pdfplumber unavailable/empty
            if len(text.strip()) < 80:
                try:
                    import pypdf
                    reader = pypdf.PdfReader(io.BytesIO(content_bytes))
                    pages_count = len(reader.pages)
                    pages = [f"[Page {i + 1} of {pages_count}]\n{page.extract_text() or ''}" for i, page in enumerate(reader.pages)]
                    cand = '\n\n'.join(pages).strip()
                    if len(cand) > len(text):
                        text = cand
                except Exception:
                    pass

            # 3. Try Bedrock native PDF reader for scanned/complex PDFs
            if len(text.strip()) < 80:
                br_txt = _extract_pdf_with_bedrock(content_bytes)
                if len(br_txt.strip()) > len(text.strip()):
                    text = br_txt

            # 4. Stdlib fallback
            if len(text.strip()) < 60:
                std_txt = _extract_pdf_stdlib(content_bytes)
                if len(std_txt.strip()) > len(text.strip()):
                    text = std_txt

            if not text.strip():
                extraction_status = 'FAILED'
                extraction_detail = 'No readable text stream could be extracted from this PDF.'

        elif ext in ('.docx', '.doc'):
            detected_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            try:
                import docx
                doc = docx.Document(io.BytesIO(content_bytes))
                text = '\n'.join([p.text for p in doc.paragraphs if p.text.strip()])
            except Exception:
                text = _extract_docx_stdlib(content_bytes)

        elif ext in ('.xlsx', '.xls'):
            detected_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            try:
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(content_bytes), data_only=True)
                pages_count = len(wb.sheetnames)
                lines = []
                for sheet in wb.sheetnames:
                    lines.append(f'Sheet: {sheet}')
                    ws = wb[sheet]
                    for row in ws.iter_rows(max_row=80, values_only=True):
                        row_vals = [str(c) if c is not None else '' for c in row]
                        if any(row_vals):
                            lines.append(' | '.join(row_vals))
                text = '\n'.join(lines)
            except Exception:
                text = _extract_xlsx_stdlib(content_bytes)

        else:
            text = content_bytes.decode('utf-8', errors='replace')[:15000]

    except Exception as e:
        extraction_status = 'ERROR'
        extraction_detail = f'Extraction error: {e}'
        text = ''

    cleaned_text = re.sub(r'[ \t]+', ' ', text).replace('(cid:127)', '•')
    # Fix common PDF font-encoding artifact where the Indian Rupee symbol (₹) extracts as 'n' before digits (e.g. n30 -> ₹30)
    cleaned_text = re.sub(r'(?<![A-Za-z0-9_])n(?=\d[\d,]*(?:\.\d+)?\b)', '₹', cleaned_text).strip()
    words = len(cleaned_text.split()) if cleaned_text else 0
    read_mins = max(1, math.ceil(words / 200)) if words > 0 else 1
    reading_time_str = f"{read_mins} min read ({words:,} words)" if words >= 100 else f"~{max(15, words)} sec ({words} words)"
    preview = cleaned_text[:1200].strip() + ('...' if len(cleaned_text) > 1200 else '')

    return {
        'text': cleaned_text[:150000],
        'words': words,
        'pages': pages_count,
        'reading_time': reading_time_str,
        'extraction_status': extraction_status,
        'extraction_detail': extraction_detail,
        'detected_type': detected_type,
        'preview': preview,
    }
