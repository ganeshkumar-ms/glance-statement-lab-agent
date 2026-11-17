import { useState } from 'react'

function toText(val, fallback = '') {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  try {
    return JSON.stringify(val)
  } catch {
    return fallback
  }
}

function toList(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val === 'string') return val.trim() ? [val] : []
  if (typeof val === 'object') return Object.values(val)
  return []
}

function toPercent(val) {
  const num = typeof val === 'number' ? val : parseFloat(String(val || '0').replace(/[^\d.]/g, ''))
  if (isNaN(num)) return 0
  return Math.max(0, Math.min(100, Math.round(num)))
}

const PALETTE = ['#078cff', '#38bdf8', '#10b981', '#f59e0b', '#6366f1', '#14b8a6', '#ec4899']

function ShieldIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function CheckIcon({ size = 14 }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function AlertIcon({ size = 14 }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function FileIcon({ size = 14 }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function buildDonutSlices(items, labelKey, pctKey, amountKey) {
  const list = items || []
  const totalShare = list.reduce((sum, item) => sum + (toPercent(item?.[pctKey]) || 20), 0) || 100
  let cumulativeAngle = 0
  return list.map((item, idx) => {
    const pct = toPercent(item?.[pctKey]) || Math.round(100 / Math.max(1, list.length))
    const angle = (pct / totalShare) * 360
    const startAngle = cumulativeAngle
    const endAngle = cumulativeAngle + angle
    cumulativeAngle = endAngle

    const startRad = (startAngle - 90) * (Math.PI / 180)
    const endRad = (endAngle - 90) * (Math.PI / 180)
    const rOuter = 82
    const rInner = 50
    const cx = 100
    const cy = 100
    const x1 = cx + rOuter * Math.cos(startRad)
    const y1 = cy + rOuter * Math.sin(startRad)
    const x2 = cx + rOuter * Math.cos(endRad)
    const y2 = cy + rOuter * Math.sin(endRad)
    const x3 = cx + rInner * Math.cos(endRad)
    const y3 = cy + rInner * Math.sin(endRad)
    const x4 = cx + rInner * Math.cos(startRad)
    const y4 = cy + rInner * Math.sin(startRad)
    const largeArc = angle > 180 ? 1 : 0
    const pathData = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`

    return {
      label: toText(item?.[labelKey], `Section ${idx + 1}`),
      share: Math.round((pct / totalShare) * 100),
      amount: amountKey ? toText(item?.[amountKey]) : '',
      summary: toText(item?.summary || item?.detail),
      color: PALETTE[idx % PALETTE.length],
      pathData,
      idx
    }
  })
}

function parseRejection(data) {
  const rej = data?.rejection_details || {}
  const msg = typeof data?.message === 'string' ? data.message : ''
  let title = rej.title || data?.title || ''
  let filename = rej.filename || data?.filename || data?.document?.filename || data?.document_metadata?.filename || 'Uploaded Document'
  let reason = rej.reason || rej.why || ''
  let technicalDetail = rej.technical_detail || ''
  let supported = rej.supported_formats || ''
  let howToFix = rej.how_to_fix || ''

  if (msg.includes('•') || (!reason && msg.includes('File Not Accepted'))) {
    const parts = msg.split(/\s*•\s*/)
    parts.forEach((p, idx) => {
      const part = p.trim()
      if (idx === 0 && !title) title = part
      else if (part.toLowerCase().startsWith('file:') && !filename) filename = part.substring(part.indexOf(':') + 1).trim()
      else if (part.toLowerCase().includes('why it was not accepted:') && !reason) reason = part.substring(part.indexOf(':') + 1).trim()
      else if (part.toLowerCase().includes('technical details:') && !technicalDetail) technicalDetail = part.substring(part.indexOf(':') + 1).trim()
      else if (part.toLowerCase().includes('supported formats') && !supported) supported = part.substring(part.indexOf(':') + 1).trim()
      else if (part.toLowerCase().includes('how to fix') && !howToFix) howToFix = part.substring(part.indexOf(':') + 1).trim()
    })
  }
  if (!title) title = 'File Not Accepted'
  const isSecurity = /credential|secret|access key|password|token/i.test(title + ' ' + reason)
  const reasonLabel = isSecurity ? 'Security & Policy Violation' : 'Reason for Rejection'
  const isFormatIssue = /format|extension|unsupported|binary|unreadable|corrupt|container|mime/i.test(title + ' ' + reason + ' ' + technicalDetail) && !isSecurity && !/empty|blank/i.test(title + ' ' + reason)
  return { title, filename, reason, reasonLabel, technicalDetail, supported: isFormatIssue ? supported : '', howToFix }
}

export default function GlanceResultCard({ data, guardrails: propGuardrails, onFollowUp }) {
  const [activeView, setActiveView] = useState('visuals') // 'visuals' | 'six_outputs' | 'watchouts'
  const [hoveredSlice, setHoveredSlice] = useState(null)

  if (!data || typeof data !== 'object') {
    return <div className="plainChatBubble">No response received.</div>
  }

  const guardrails = propGuardrails || data?.guardrails || {}
  const traceId = data?.trace_id || guardrails?.trace_id || ''

  // 1. Structured File Rejection Card
  if (data.rejected || data.rejection_details || (typeof data.message === 'string' && data.message.includes('File Not Accepted'))) {
    const rej = parseRejection(data)
    return (
      <div className="glanceRejectionCard">
        <div className="glanceRejectionHeader">
          <div className="glanceRejectionBadge">
            <AlertIcon size={15} />
            <span>{rej.title}</span>
          </div>
          <span className="glanceRejectionFile">
            <FileIcon size={13} />
            <span>{rej.filename}</span>
          </span>
        </div>

        <div className="glanceRejectionBody">
          {rej.reason && (
            <div className="rejectionSection">
              <span className="rejectionLabel">{rej.reasonLabel || 'Reason for Rejection'}</span>
              <p className="rejectionValue">{rej.reason}</p>
            </div>
          )}
          {rej.technicalDetail && (
            <div className="rejectionSection">
              <span className="rejectionLabel">Technical Details</span>
              <p className="rejectionValue mono">{rej.technicalDetail}</p>
            </div>
          )}
          {rej.supported && (
            <div className="rejectionSection">
              <span className="rejectionLabel">Supported Formats for GLANCE</span>
              <p className="rejectionValue">{rej.supported}</p>
            </div>
          )}
          {rej.howToFix && (
            <div className="rejectionSection fixSection">
              <span className="rejectionLabel">How to Fix &amp; Re-upload</span>
              <p className="rejectionValue">{rej.howToFix}</p>
            </div>
          )}
          {!rej.reason && (
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '13.5px', color: '#e2e8f0' }}>
              {data.message}
            </div>
          )}
        </div>
      </div>
    )
  }

  // 2. Conversational / Chat Reply
  if (data.type === 'chat' || (!data.headline_picture && !data.six_outputs && !data.key_figures && data.message)) {
    return (
      <div className="plainChatBubble" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {guardrails?.status === 'BLOCKED' && (
          <div style={{ marginBottom: '12px' }}>
            <span className="glnGuardrailPill blocked">
              <ShieldIcon />
              <span>Guardrails: Blocked ({guardrails.triggered_rule || guardrails.rejection_reason || 'Policy Violation'})</span>
            </span>
          </div>
        )}
        {toText(data.message, 'How can I help clarify your document today?')}
      </div>
    )
  }

  const extStatus = data.extraction_status || {}
  const pagesCount = extStatus.pages || data.metrics?.pages_count || data.document?.pages || 1
  const wordCount = extStatus.words || data.metrics?.word_count || data.document?.words || 0
  const readTime = extStatus.reading_time || data.metrics?.reading_time || (wordCount ? `${Math.max(1, Math.ceil(wordCount / 200))} min read` : '1 min read')
  const docClass = toText(data.document_class || data.statement_category, 'Enterprise Document')
  const isFinancial = Boolean(data.is_financial)
  const confidence = data.extraction_confidence || { level: 'HIGH', reason: 'Readable document text extracted cleanly.' }
  const quality = data.quality_assessment || { rating: 'HIGH QUALITY', assessment: 'Structured enterprise document with clear topics and verifiable evidence.' }

  const keyTopics = toList(data.key_topics)
  const techDetails = toList(data.technical_or_structural_details)
  const sectionCoverage = toList(data.section_coverage)
  const keyFigures = toList(data.key_figures)
  const visualBreakdown = isFinancial ? toList(data.visual_breakdown) : []
  const cashFlowSeries = isFinancial ? toList(data.cash_flow_series) : []
  const watchouts = toList(data.watchouts)
  const followups = toList(data.suggested_followups)
  const six = data.six_outputs || {}
  const displaySummary = toText(data.headline_picture || six.what_this_is_about)

  // Build interactive Donut from financial breakdown if financial, otherwise from real sectionCoverage
  const donutSource = visualBreakdown.length > 0
    ? buildDonutSlices(visualBreakdown, 'label', 'share_percent', 'amount')
    : buildDonutSlices(sectionCoverage, 'section', 'share_percent', null)

  const watchoutCounts = watchouts.reduce(
    (acc, w) => {
      const s = toText(w?.severity, 'medium').toLowerCase()
      if (s === 'high') acc.high += 1
      else if (s === 'low') acc.low += 1
      else acc.medium += 1
      return acc
    },
    { high: 0, medium: 0, low: 0 }
  )

  return (
    <div className="glanceCard">
      {/* 0. GUARDRAILS STATUS BAR & TOP-RIGHT TRACE ID */}
      <div className="glnTopMetaBar">
        <span className={`glnGuardrailPill ${guardrails?.status === 'BLOCKED' ? 'blocked' : 'passed'}`}>
          <ShieldIcon />
          <span>
            {guardrails?.status === 'BLOCKED'
              ? `Guardrails: Blocked (${guardrails.triggered_rule || guardrails.rejection_reason || 'Policy Violation'})`
              : guardrails?.status === 'REDACTED'
              ? `Guardrails: ${guardrails.redacted_count || 1} Secret(s) Sanitized`
              : 'Guardrails: Passed · Verified Safe'}
          </span>
        </span>

        {traceId && (
          <span className="glnTraceChip" title="Verification Trace Code">
            {traceId}
          </span>
        )}
      </div>

      {/* 1. SMART DOCUMENT CLASSIFICATION & EXTRACTION STATUS */}
      <div className="glnClassificationBanner">
        <div className="glnClassLeft">
          <span className="glnStatusBadge readable">
            <CheckIcon size={13} />
            <span>{extStatus.readable !== false ? 'Readable Document · Content Extraction Successful' : 'Extraction Issue Detected'}</span>
          </span>
          <span className="catBadge">
            {docClass} · {pagesCount} {pagesCount === 1 ? 'page' : 'pages'}
          </span>
          <span className={`glnConfBadge conf-${String(confidence.level || 'HIGH').toLowerCase()}`}>
            Confidence: {confidence.level}
          </span>
        </div>
      </div>

      {data.statement_title && (
        <div className="statementHeadlineTitle">{toText(data.statement_title)}</div>
      )}

      <div className="clearPictureBox">
        <span className="pictureLabel">WHAT THIS DOCUMENT IS ABOUT</span>
        <p>{displaySummary}</p>
      </div>

      {/* 2. EVIDENCE-BASED VISUAL TELEMETRY CARDS */}
      <div className="glnKpiVisualGrid">
        <div className="glnKpiCard">
          <span className="glnKpiLabel">DOCUMENT EXTENT</span>
          <strong className="glnKpiVal">{pagesCount} {pagesCount === 1 ? 'Page' : 'Pages'}</strong>
          <span className="glnKpiSub">{wordCount ? `${wordCount.toLocaleString()} extracted words` : 'Verified text stream'}</span>
        </div>
        <div className="glnKpiCard">
          <span className="glnKpiLabel">EST. READ TIME</span>
          <strong className="glnKpiVal">{readTime.replace(/\s*\(.*\)/, '')}</strong>
          <span className="glnKpiSub">Calculated at 200 wpm</span>
        </div>
        <div className="glnKpiCard">
          <span className="glnKpiLabel">EXTRACTION QUALITY</span>
          <strong className="glnKpiVal green">{quality.rating || 'HIGH QUALITY'}</strong>
          <span className="glnKpiSub">{confidence.level} source confidence</span>
        </div>
        <div className="glnKpiCard">
          <span className="glnKpiLabel">WATCHOUTS DETECTED</span>
          <strong className="glnKpiVal amber">{watchouts.length}</strong>
          <span className="glnKpiSub">{watchoutCounts.high} High · {watchoutCounts.medium} Med · {watchoutCounts.low} Low</span>
        </div>
      </div>

      {/* 3. VIEW NAVIGATION TABS */}
      <div className="chartNavTabs">
        <button
          type="button"
          className={`chartTabBtn ${activeView === 'visuals' ? 'active' : ''}`}
          onClick={() => setActiveView('visuals')}
        >
          Visual Analytics &amp; Architecture
        </button>
        <button
          type="button"
          className={`chartTabBtn ${activeView === 'six_outputs' ? 'active' : ''}`}
          onClick={() => setActiveView('six_outputs')}
        >
          6 Core Enterprise Deliverables
        </button>
        <button
          type="button"
          className={`chartTabBtn ${activeView === 'watchouts' ? 'active' : ''}`}
          onClick={() => setActiveView('watchouts')}
        >
          Watchouts &amp; Source Traceability ({watchouts.length})
        </button>
      </div>

      {/* TAB A: RICH VISUAL ANALYTICS & DOCUMENT TOPOLOGY */}
      {activeView === 'visuals' && (
        <div className="glnTabBody">
          {/* VISUAL ROW 1: INTERACTIVE DONUT + STACKED DISTRIBUTION / CASH FLOW */}
          <div className="visualChartsGrid">
            {donutSource.length > 0 && (
              <div className="chartCardWidget">
                <div className="chartCardTitle">
                  <span>{isFinancial && visualBreakdown.length > 0 ? 'FINANCIAL ALLOCATION BREAKDOWN' : 'DOCUMENT SECTION & TOPIC WEIGHT'}</span>
                </div>
                <div className="donutContainer">
                  <svg viewBox="0 0 200 200" className="donutSvg">
                    <circle cx="100" cy="100" r="82" fill="none" stroke="rgba(7, 140, 255, 0.1)" strokeWidth="32" />
                    {donutSource.map(slice => (
                      <path
                        key={slice.idx}
                        d={slice.pathData}
                        fill={slice.color}
                        opacity={hoveredSlice === null || hoveredSlice === slice.idx ? 0.95 : 0.35}
                        stroke="#020c16"
                        strokeWidth="1.5"
                        style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                        onMouseEnter={() => setHoveredSlice(slice.idx)}
                        onMouseLeave={() => setHoveredSlice(null)}
                      />
                    ))}
                    <circle cx="100" cy="100" r="46" fill="#051a2c" />
                    <text x="100" y="96" textAnchor="middle" fill="#f0f7ff" fontSize="17" fontWeight="bold">
                      {hoveredSlice !== null ? `${donutSource[hoveredSlice]?.share}%` : `${donutSource.length}`}
                    </text>
                    <text x="100" y="112" textAnchor="middle" fill="#849bb4" fontSize="9.5" letterSpacing="0.5">
                      {hoveredSlice !== null ? 'SHARE' : (isFinancial ? 'BUCKETS' : 'SECTIONS')}
                    </text>
                  </svg>

                  <div className="donutLegend">
                    {donutSource.map(s => (
                      <div
                        key={s.idx}
                        className={`legendItem ${hoveredSlice === s.idx ? 'highlighted' : ''}`}
                        onMouseEnter={() => setHoveredSlice(s.idx)}
                        onMouseLeave={() => setHoveredSlice(null)}
                      >
                        <span className="legendDot" style={{ background: s.color }} />
                        <span className="legendLabel">{s.label}</span>
                        <span className="legendPct">{s.share}%</span>
                        {s.amount && <span className="legendAmt">{s.amount}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT VISUAL CARD: REAL CASH FLOW IF FINANCIAL, OR INTERACTIVE COLUMN CHART & SEVERITY STRIP */}
            {isFinancial && cashFlowSeries.length > 0 ? (
              <div className="chartCardWidget">
                <div className="chartCardTitle">
                  <span>EXTRACTED PERIOD / CASH-FLOW COMPARISON</span>
                </div>
                <div className="barsPanel">
                  {(() => {
                    const maxVal = Math.max(...cashFlowSeries.map(c => Math.abs(Number(c.value) || 0)), 1)
                    return cashFlowSeries.map((pt, i) => {
                      const pct = Math.max(8, Math.round(((Math.abs(Number(pt.value) || 0)) / maxVal) * 100))
                      return (
                        <div key={i} className="barItem">
                          <div className="barTop">
                            <span className="barLabel">{toText(pt.period)}</span>
                            <span className="barAmt">{toText(pt.display_value || pt.value)}</span>
                          </div>
                          <div className="barTrack">
                            <div className="barFill" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            ) : (
              <div className="chartCardWidget">
                <div className="chartCardTitle">
                  <span>SECTION SHARE COLUMN CHART &amp; GOVERNANCE</span>
                </div>
                <div className="glnVisualStackWrap">
                  {/* Interactive Vertical Column Bar Chart */}
                  {donutSource.length > 0 && (
                    <div className="glnColChartWrap">
                      {(() => {
                        const maxShare = Math.max(...donutSource.map(s => s.share), 1)
                        return donutSource.map(s => {
                          const barH = Math.max(18, Math.round((s.share / maxShare) * 100))
                          const shortLbl = s.label.length > 11 ? `${s.label.slice(0, 10)}…` : s.label
                          return (
                            <div
                              key={s.idx}
                              className={`glnColItem ${hoveredSlice === s.idx ? 'active' : ''}`}
                              onMouseEnter={() => setHoveredSlice(s.idx)}
                              onMouseLeave={() => setHoveredSlice(null)}
                              title={`${s.label}: ${s.share}%`}
                            >
                              <span className="glnColVal">{s.share}%</span>
                              <div className="glnColTrack">
                                <div
                                  className="glnColBar"
                                  style={{ height: `${barH}%`, background: s.color }}
                                />
                              </div>
                              <span className="glnColLbl">{shortLbl}</span>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}

                  {/* Horizontal Stacked Coverage Bar */}
                  <div className="glnStackedLabel" style={{ marginTop: '6px' }}>PROPORTIONAL TOPIC DISTRIBUTION</div>
                  <div className="glnStackedBar">
                    {donutSource.map(s => (
                      <div
                        key={s.idx}
                        className="glnStackedSeg"
                        style={{ width: `${s.share}%`, background: s.color }}
                        title={`${s.label}: ${s.share}%`}
                        onMouseEnter={() => setHoveredSlice(s.idx)}
                        onMouseLeave={() => setHoveredSlice(null)}
                      />
                    ))}
                  </div>

                  {/* Compact Inline Watchout Severity Strip */}
                  <div className="glnSevCompactRow">
                    <span className="glnSevCompactLabel">GOVERNANCE:</span>
                    <span className="glnSevChip high">High: <strong>{watchoutCounts.high}</strong></span>
                    <span className="glnSevChip med">Med: <strong>{watchoutCounts.medium}</strong></span>
                    <span className="glnSevChip low">Low: <strong>{watchoutCounts.low}</strong></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* FULL-WIDTH INTERACTIVE AREA & LINE CHART FOR STATEMENT LAB */}
          {donutSource.length >= 2 && (
            <div className="chartCardWidget fullWidth">
              <div className="chartCardTitle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span>{isFinancial && cashFlowSeries.length >= 2 ? 'FINANCIAL TRAJECTORY CURVE' : 'DOCUMENT SECTION WEIGHT & SIGNAL CURVE'}</span>
                <span style={{ fontSize: '10.5px', color: '#849bb4', fontWeight: 600 }}>
                  {hoveredSlice !== null && donutSource[hoveredSlice]
                    ? `${donutSource[hoveredSlice].label}: ${donutSource[hoveredSlice].share}%`
                    : 'Hover nodes to inspect section weight'}
                </span>
              </div>
              {(() => {
                const pts = donutSource
                const W = 720
                const H = 148
                const padX = 44
                const padTop = 22
                const padBot = 32
                const maxV = Math.max(...pts.map(p => p.share), 1)
                const stepX = pts.length > 1 ? (W - padX * 2) / (pts.length - 1) : 0
                const coords = pts.map((p, i) => {
                  const x = padX + i * stepX
                  const y = H - padBot - ((p.share / maxV) * (H - padTop - padBot))
                  return { ...p, x, y }
                })
                const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
                const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${H - padBot} L ${coords[0].x} ${H - padBot} Z`
                return (
                  <svg viewBox={`0 0 ${W} ${H}`} className="glnAreaSvg" role="img" aria-label="Document section weight curve">
                    <defs>
                      <linearGradient id="glnAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#078cff" stopOpacity="0.42" />
                        <stop offset="100%" stopColor="#078cff" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    {[0.25, 0.5, 0.75, 1].map((frac, idx) => {
                      const gy = H - padBot - frac * (H - padTop - padBot)
                      return <line key={idx} x1={padX} y1={gy} x2={W - padX} y2={gy} stroke="rgba(148,163,184,0.12)" strokeDasharray="3 4" />
                    })}
                    <path d={areaPath} fill="url(#glnAreaGrad)" />
                    <path d={linePath} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinejoin="round" />
                    {coords.map(c => {
                      const isHot = hoveredSlice === c.idx
                      const short = c.label.length > 13 ? `${c.label.slice(0, 12)}…` : c.label
                      return (
                        <g
                          key={c.idx}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredSlice(c.idx)}
                          onMouseLeave={() => setHoveredSlice(null)}
                        >
                          <circle cx={c.x} cy={c.y} r={isHot ? 7 : 5} fill={c.color} stroke="#041628" strokeWidth="2" />
                          <text x={c.x} y={c.y - 10} textAnchor="middle" fill="#f8fafc" fontSize="10.5" fontWeight="700">
                            {c.share}%
                          </text>
                          <text x={c.x} y={H - 10} textAnchor="middle" fill={isHot ? '#7dd3fc' : '#94a3b8'} fontSize="10">
                            {short}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                )
              })()}
            </div>
          )}

          {/* VISUAL ROW 2: TECHNICAL / STRUCTURAL ARCHITECTURE CARDS */}
          {techDetails.length > 0 && (
            <div className="glanceSection">
              <div className="sectionHeader">ARCHITECTURE &amp; KEY TECHNICAL DETAILS (SOURCE-TRACED)</div>
              <div className="glnArchVisualGrid">
                {techDetails.map((td, idx) => (
                  <div key={idx} className="glnArchNodeCard">
                    <div className="glnArchNodeTop">
                      <span className="glnArchBadge" style={{ borderColor: PALETTE[idx % PALETTE.length], color: PALETTE[idx % PALETTE.length] }}>
                        {toText(td?.label)}
                      </span>
                    </div>
                    <div className="glnArchValue">{toText(td?.value)}</div>
                    {td?.source_evidence && (
                      <div className="glnArchSource">Source: {toText(td.source_evidence)}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VISUAL ROW 3: KEY TOPICS & DOCUMENT FLOW PIPELINE */}
          {keyTopics.length > 0 && (
            <div className="glanceSection">
              <div className="sectionHeader">KEY TOPICS &amp; DOCUMENT FLOW ({keyTopics.length})</div>
              <div className="glnFlowPipeline">
                {keyTopics.map((topic, i) => {
                  const accent = PALETTE[i % PALETTE.length]
                  return (
                    <div key={i} className="glnFlowStageWrap">
                      <div className="glnFlowStageCard" style={{ borderTopColor: accent }}>
                        <div className="glnFlowStageHead">
                          <span className="glnFlowStagePill" style={{ color: accent, borderColor: accent }}>
                            STAGE {String(i + 1).padStart(2, '0')}
                          </span>
                          <span className="glnFlowStageStep">{i + 1}/{keyTopics.length}</span>
                        </div>
                        <div className="glnFlowStageTitle">{toText(topic)}</div>
                      </div>
                      {i < keyTopics.length - 1 && (
                        <span className="glnFlowArrow" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* REAL EXTRACTED FIGURES (ONLY WHEN PRESENT) */}
          {keyFigures.length > 0 && (
            <div className="glanceSection">
              <div className="sectionHeader">EXTRACTED FIGURES &amp; DATES (WITH SOURCE TRACEABILITY)</div>
              <div className="figuresGrid">
                {keyFigures.map((fig, idx) => (
                  <div key={idx} className={`figureCard emp-${toText(fig?.emphasis, 'neutral')}`}>
                    <div className="figLabel">{toText(fig?.label, `Item ${idx + 1}`)}</div>
                    <div className="figValue">{toText(fig?.value, '—')}</div>
                    {fig?.note && <div className="figNote">{toText(fig.note)}</div>}
                    {fig?.source_evidence && (
                      <div className="glnSourceTrace">Source: &ldquo;{toText(fig.source_evidence)}&rdquo;</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB B: SIX CORE ENTERPRISE DELIVERABLES */}
      {activeView === 'six_outputs' && (
        <div className="glnSixGrid">
          <div className="glnSixCard">
            <span className="glnSixLabel">1. WHAT THIS IS ABOUT</span>
            <p>{toText(six.what_this_is_about || displaySummary)}</p>
          </div>
          <div className="glnSixCard">
            <span className="glnSixLabel">2. WHAT YOU NEED TO DO</span>
            <p>{toText(six.what_you_need_to_do, 'No immediate action required — informational reference.')}</p>
          </div>
          <div className="glnSixCard full">
            <span className="glnSixLabel">3. IMPORTANT DETAILS (SOURCE-TRACED)</span>
            {toList(six.important_details).length > 0 ? (
              <ul className="glnDetailsList">
                {toList(six.important_details).map((d, i) => (
                  <li key={i}>
                    <strong>{toText(d?.item)}:</strong> {toText(d?.value)}
                    {d?.source_evidence && <span className="glnInlineTrace"> — Source: {toText(d.source_evidence)}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p>See Visual Analytics &amp; Architecture tab for all extracted technical details.</p>
            )}
          </div>
          <div className="glnSixCard">
            <span className="glnSixLabel">4. WHY THIS MATTERS</span>
            <p>{toText(six.why_this_matters, 'Provides clarity and operational alignment for enterprise stakeholders.')}</p>
          </div>
          <div className="glnSixCard">
            <span className="glnSixLabel">5. WHAT HAPPENS NEXT</span>
            <p>{toText(six.what_happens_next, 'Review extracted specifications and watchouts with your team.')}</p>
          </div>
          <div className="glnSixCard full">
            <span className="glnSixLabel">6. SIMPLIFIED COMMUNICATION (PLAIN-ENGLISH EXECUTIVE SUMMARY)</span>
            <p>{toText(six.simplified_communication || displaySummary)}</p>
          </div>
        </div>
      )}

      {/* WATCHOUTS SECTION (VISIBLE IN WATCHOUTS TAB OR AT BOTTOM OF VISUALS) */}
      {(activeView === 'watchouts' || activeView === 'visuals') && watchouts.length > 0 && (
        <div className="glanceSection">
          <div className="sectionHeader">WATCHOUTS &amp; GOVERNANCE FLAGS ({watchouts.length})</div>
          <div className="watchoutsGrid">
            {watchouts.map((w, idx) => {
              const sev = toText(w?.severity, 'medium').toLowerCase()
              return (
                <div key={idx} className={`watchoutCard sev-${sev}`}>
                  <div className="watchoutTop">
                    <span className={`sevBadge sev-${sev}`}>
                      {sev === 'high' ? 'HIGH SEVERITY' : sev === 'low' ? 'LOW' : 'MEDIUM'}
                    </span>
                    <span className="watchoutTitle">{toText(w?.title, 'Watchout Item')}</span>
                  </div>
                  {(w?.explanation || w?.impact) && (
                    <p className="watchoutImpact">{toText(w?.explanation || w?.impact)}</p>
                  )}
                  {w?.source_evidence && (
                    <div className="glnWatchoutSource">
                      <strong>Supporting Source Text:</strong> &ldquo;{toText(w.source_evidence)}&rdquo;
                    </div>
                  )}
                  {w?.action && (
                    <div className="watchoutAction">
                      <span className="actionTag">RECOMMENDED ACTION:</span> {toText(w.action)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Suggested Follow-Up Prompts */}
      {followups.length > 0 && (
        <div className="followupsBlock">
          <span className="followupsLabel">SUGGESTED DEEP-DIVES:</span>
          <div className="followupsChips">
            {followups.map((q, idx) => (
              <button
                key={idx}
                type="button"
                className="followupChip"
                onClick={() => onFollowUp && onFollowUp(toText(q))}
              >
                {toText(q)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
