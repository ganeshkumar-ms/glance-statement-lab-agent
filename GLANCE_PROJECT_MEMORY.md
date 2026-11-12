# GLANCE — Project Memory & Architecture Summary
**Agent #8:** GLANCE — Interactive Statement Lab (`Complex statement. Clear picture.`)

## Live Endpoints
- **CloudFront URL:** `https://d24bu68rg7e4m.cloudfront.net`
- **CloudFront Distribution ID:** `E35QFT3H36BWDK`
- **API Gateway:** `https://46woy3v8j7.execute-api.us-east-1.amazonaws.com`
- **Lambda Function:** `glance-backend-api`
- **IAM Role:** `glance-backend-lambda-role`
- **S3 Bucket:** `glance-ui-984625844016`
- **Model:** Amazon Bedrock Nova Pro (`us.amazon.nova-pro-v1:0`) with Claude 3 Haiku fallback (`us.anthropic.claude-3-haiku-20240307-v1:0`)

## Architecture & Key Files
- `glance/backend/services/glance_service.py`: Dual-mode Bedrock Converse engine (`type: "chat"` for greetings/multilingual Q&A with randomized greeting variety avoiding repeat of last reply; `type: "statement_analysis"` for structured financial, bank, billing, tax, or policy statements).
- `glance/backend/services/document_service.py`: Multi-format extraction (PDF, DOCX, XLSX, CSV, JSON, XML, TXT, MD) with pure-stdlib DOCX/XLSX ZIP XML and PDF text stream fallbacks for zero-dependency AWS Lambda execution.
- `glance/backend/services/guardrail_service.py`: Prompt injection filtering + PII redaction tuned to avoid false-positive currency redaction.
- `glance/backend/services/viewer_service.py`: Obsidian/Ivory dark-themed source statement HTML viewer.
- `glance/backend/lambda_function.py`: Pure-stdlib + boto3 AWS Lambda handler with multipart upload parsing, S3 persistence, presigned >4MB downloads, inline PDF viewer, and CORS headers.
- `glance/frontend/src/App.jsx`: React workspace with `ErrorBoundary`, single document badge + `Open ↗` inside user bubbles, directly clickable `#title` without pencil icon, smart topic titles, `RECENT CONVERSATIONS` home header, and strict `currentList` multi-turn history alternation.
- `glance/frontend/src/components/GlanceResultCard.jsx`: Safe `toText`/`toList`/`toPercent` guards, horizontal `.metricsStrip`, key figures grid, animated visual breakdown share bars, tabbed Plain English / Watchouts / Next Actions view, and clickable follow-up chips.
- `glance/frontend/src/components/GlanceSidebar.jsx`: Fixed 40px `.histRow`, block ellipsis truncation (zero overlay), frosted-blur `.histActions` pill bar, and TAXORA-standard inline delete confirmation.

