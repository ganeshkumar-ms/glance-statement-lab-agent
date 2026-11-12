import html
from pathlib import Path
from services import document_service


def render_html(file_path: Path, display_name: str) -> str:
    """Renders document content into a styled GLANCE Obsidian & Warm Ivory HTML viewer."""
    ext = file_path.suffix.lower()
    content_raw = ''
    try:
        if ext in ('.docx', '.doc', '.xlsx', '.xls'):
            content_raw = document_service.extract_document(display_name, file_path.read_bytes()).get('text', '')
        else:
            content_raw = file_path.read_text(encoding='utf-8', errors='replace')
    except Exception:
        content_raw = f"[Binary or encoded file: {display_name}]"

    safe_content = html.escape(content_raw or f"[No readable text found in {display_name}]")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(display_name)} - GLANCE Viewer</title>
<style>
  :root {{
    --bg: #11100b;
    --panel: #211e16;
    --line: rgba(239, 231, 209, 0.22);
    --text: #fdfaf0;
    --muted: #b4ab94;
    --a1: #efe7d1;
    --a2: #887d61;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; scrollbar-width: none; }}
  *::-webkit-scrollbar {{ display: none; }}
  body {{
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', -apple-system, sans-serif;
    padding: 24px;
    line-height: 1.65;
  }}
  .header {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 20px;
    gap: 12px;
  }}
  .titleWrap {{ display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }}
  .title {{ font-size: 15px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
  .badge {{
    background: rgba(239, 231, 209, 0.14);
    color: var(--a1);
    border: 1px solid rgba(239, 231, 209, 0.35);
    padding: 3px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }}
  .viewerBox {{
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 20px;
    overflow: auto;
    max-height: 85vh;
  }}
  pre {{
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
    color: #efe7d1;
    white-space: pre-wrap;
    word-break: break-word;
  }}
</style>
</head>
<body>
  <div class="header">
    <div class="titleWrap">
      <span class="title">{html.escape(display_name)}</span>
      <span class="badge">GLANCE STATEMENT SOURCE</span>
    </div>
  </div>
  <div class="viewerBox">
    <pre>{safe_content}</pre>
  </div>
</body>
</html>
"""

