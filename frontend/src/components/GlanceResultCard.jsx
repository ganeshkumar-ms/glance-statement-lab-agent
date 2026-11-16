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

const PALETTE = ['#078cff', '#38bdf8', '#34d399', '#fbbf24', '#f43f5e', '#a855f7', '#6366f1']

export default function GlanceResultCard({ data, onFollowUp }) {
  const [activeTab, setActiveTab] = useState('visuals') // 'visuals', 'donut', 'bars', 'trend', 'plain'
  const [hoveredSlice, setHoveredSlice] = useState(null)

  if (!data || typeof data !== 'object') {
    return <div className="plainChatBubble">No response received.</div>
  }

  // Mode 1: Conversational / general response
  if (data.type === 'chat' || (!data.headline_picture && !data.key_figures && data.message)) {
    return (
      <div className="plainChatBubble">
        {toText(data.message, 'How can I help clarify a statement today?')}
      </div>
    )
  }

  const score = typeof data.clarity_score === 'number' ? data.clarity_score : 88
  const risk = toText(data.risk_level, 'Low')
  const category = toText(data.statement_category, 'Interactive Statement')
  const metrics = data.metrics || {}
  const keyFigures = toList(data.key_figures)
  const visualBreakdown = toList(data.visual_breakdown)
  const plainEnglish = toList(data.plain_english)
  const watchouts = toList(data.watchouts)
  const nextActions = toList(data.next_actions)
  const followups = toList(data.suggested_followups)

  const badgeTone =
    score >= 85 ? 'optimal' : score >= 60 ? 'caution' : 'alert'

  // Pre-calculate SVG Donut Slices
  const totalShare = visualBreakdown.reduce((sum, item) => sum + toPercent(item?.share_percent), 0) || 100
  let cumulativeAngle = 0
  const donutSlices = visualBreakdown.map((item, idx) => {
    const pct = toPercent(item?.share_percent) || (100 / Math.max(1, visualBreakdown.length))
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
      label: toText(item?.label, `Item ${idx + 1}`),
      share: pct,
      amount: toText(item?.amount),
      detail: toText(item?.detail),
      color: PALETTE[idx % PALETTE.length],
      pathData,
      idx
    }
  })

  // Gauge Meter Math (score 0..100)
  const gaugeAngle = -90 + (score / 100) * 180
  const needleRad = (gaugeAngle - 90) * (Math.PI / 180)
  const needleX = 100 + 55 * Math.cos(needleRad)
  const needleY = 90 + 55 * Math.sin(needleRad)

  return (
    <div className="glanceCard">
      {/* Header Row */}
      <div className="glanceHeader">
        <div className="glanceHeaderLeft">
          <span className={`clarityPill ${badgeTone}`}>
            <span className="dot" />
            CLARITY {score}/100
          </span>
          <span className="catBadge">{category}</span>
          <span className={`riskBadge risk-${risk.toLowerCase()}`}>Risk: {risk}</span>
        </div>
      </div>

      {data.statement_title && (
        <div className="statementHeadlineTitle">{toText(data.statement_title)}</div>
      )}

      {data.headline_picture && (
        <div className="clearPictureBox">
          <span className="pictureLabel">CLEAR PICTURE</span>
          <p>{toText(data.headline_picture)}</p>
        </div>
      )}

      {/* Sleek Compact Metrics Strip */}
      <div className="metricsStrip">
        <div className="mItem">
          <span className="mDot" />
          <span className="mVal">{metrics.figures_extracted ?? keyFigures.length}</span>
          <span className="mKey">Figures</span>
        </div>
        <div className="mSep" />
        <div className="mItem">
          <span className="mVal">{metrics.clauses_simplified ?? plainEnglish.length}</span>
          <span className="mKey">Simplified</span>
        </div>
        <div className="mSep" />
        <div className="mItem">
          <span className="mVal">{metrics.flags_detected ?? watchouts.length}</span>
          <span className="mKey">Watchouts</span>
        </div>
        {metrics.reading_time && (
          <>
            <div className="mSep" />
            <div className="mItem">
              <span className="mVal">{toText(metrics.reading_time)}</span>
              <span className="mKey">Read Time</span>
            </div>
          </>
        )}
      </div>

      {/* Visual Chart Navigation Tabs */}
      <div className="chartNavTabs">
        <button
          type="button"
          className={`chartTabBtn ${activeTab === 'visuals' ? 'active' : ''}`}
          onClick={() => setActiveTab('visuals')}
        >
          📊 Comprehensive Charts
        </button>
        <button
          type="button"
          className={`chartTabBtn ${activeTab === 'donut' ? 'active' : ''}`}
          onClick={() => setActiveTab('donut')}
        >
          🍩 Allocation Donut
        </button>
        <button
          type="button"
          className={`chartTabBtn ${activeTab === 'trend' ? 'active' : ''}`}
          onClick={() => setActiveTab('trend')}
        >
          📈 Flow & Trend Curve
        </button>
        <button
          type="button"
          className={`chartTabBtn ${activeTab === 'plain' ? 'active' : ''}`}
          onClick={() => setActiveTab('plain')}
        >
          📄 Plain English ({plainEnglish.length})
        </button>
      </div>

      {/* TAB 1: COMPREHENSIVE CHARTS & VISUAL DASHBOARD */}
      {(activeTab === 'visuals' || activeTab === 'donut') && (
        <div className="visualChartsGrid">
          {/* Donut Chart Widget */}
          <div className="chartCardWidget">
            <div className="chartCardTitle">
              <span>🍩 ALLOCATION & BREAKDOWN DISTRIBUTION</span>
            </div>
            <div className="donutContainer">
              <svg viewBox="0 0 200 200" className="donutSvg">
                <circle cx="100" cy="100" r="82" fill="none" stroke="rgba(7, 140, 255, 0.1)" strokeWidth="32" />
                {donutSlices.map((slice) => (
                  <path
                    key={slice.idx}
                    d={slice.pathData}
                    fill={slice.color}
                    opacity={hoveredSlice === null || hoveredSlice === slice.idx ? 0.95 : 0.4}
                    stroke="#020c16"
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onMouseEnter={() => setHoveredSlice(slice.idx)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                ))}
                {/* Center Label */}
                <circle cx="100" cy="100" r="46" fill="#051a2c" />
                <text x="100" y="96" textAnchor="middle" fill="#f0f7ff" fontSize="17" fontWeight="bold">
                  {hoveredSlice !== null ? `${donutSlices[hoveredSlice]?.share}%` : `${score}%`}
                </text>
                <text x="100" y="112" textAnchor="middle" fill="#849bb4" fontSize="9.5" letterSpacing="0.5">
                  {hoveredSlice !== null ? 'SHARE' : 'CLARITY'}
                </text>
              </svg>
              {/* Donut Legend */}
              <div className="donutLegend">
                {donutSlices.map((s) => (
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

          {/* Statement Health & Clarity Speedometer Gauge */}
          <div className="chartCardWidget">
            <div className="chartCardTitle">
              <span>🧭 STATEMENT CLARITY & RISK GAUGE</span>
            </div>
            <div className="gaugeContainer">
              <svg viewBox="0 0 200 130" className="gaugeSvg">
                {/* Dial Arc segments */}
                <path d="M 25 100 A 75 75 0 0 1 70 36" fill="none" stroke="#f43f5e" strokeWidth="14" strokeLinecap="round" opacity="0.8" />
                <path d="M 72 35 A 75 75 0 0 1 128 35" fill="none" stroke="#fbbf24" strokeWidth="14" opacity="0.8" />
                <path d="M 130 36 A 75 75 0 0 1 175 100" fill="none" stroke="#34d399" strokeWidth="14" strokeLinecap="round" opacity="0.8" />
                {/* Needle */}
                <circle cx="100" cy="95" r="7" fill="#38bdf8" />
                <line x1="100" y1="95" x2={needleX} y2={needleY} stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
                {/* Center score readout */}
                <text x="100" y="122" textAnchor="middle" fill="#f0f7ff" fontSize="16" fontWeight="bold">
                  {score}/100 · {risk} Risk
                </text>
              </svg>
              <div className="gaugeLegend">
                <span className="gaugeZone red">🔴 Critical (0-59)</span>
                <span className="gaugeZone yellow">🟡 Caution (60-84)</span>
                <span className="gaugeZone green">🟢 Optimal (85-100)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: FLOW & TREND CURVE LINE CHART */}
      {(activeTab === 'visuals' || activeTab === 'trend') && (
        <div className="chartCardWidget fullWidth" style={{ marginTop: '14px' }}>
          <div className="chartCardTitle">
            <span>📈 STATEMENT CASH FLOW & RELATIVE VALUE TREND</span>
          </div>
          <div className="trendChartBox">
            <svg viewBox="0 0 500 140" className="trendSvg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#078cff" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#078cff" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Grid Lines */}
              <line x1="40" y1="20" x2="480" y2="20" stroke="rgba(7, 140, 255, 0.15)" strokeDasharray="3 3" />
              <line x1="40" y1="65" x2="480" y2="65" stroke="rgba(7, 140, 255, 0.15)" strokeDasharray="3 3" />
              <line x1="40" y1="110" x2="480" y2="110" stroke="rgba(7, 140, 255, 0.15)" strokeDasharray="3 3" />

              {/* Smooth trend area and path */}
              <path
                d="M 50 110 C 130 90, 180 40, 250 55 C 320 70, 390 25, 470 30 L 470 125 L 50 125 Z"
                fill="url(#trendGradient)"
              />
              <path
                d="M 50 110 C 130 90, 180 40, 250 55 C 320 70, 390 25, 470 30"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Data points */}
              <circle cx="50" cy="110" r="5" fill="#078cff" stroke="#f0f7ff" strokeWidth="2" />
              <circle cx="250" cy="55" r="5" fill="#38bdf8" stroke="#f0f7ff" strokeWidth="2" />
              <circle cx="470" cy="30" r="5" fill="#34d399" stroke="#f0f7ff" strokeWidth="2" />

              {/* Point Labels */}
              <text x="50" y="132" fill="#849bb4" fontSize="10" textAnchor="middle">Period Start</text>
              <text x="250" y="132" fill="#849bb4" fontSize="10" textAnchor="middle">Mid-Cycle Reconcile</text>
              <text x="470" y="132" fill="#34d399" fontSize="10" fontWeight="bold" textAnchor="middle">Closing Balance</text>
            </svg>
          </div>
        </div>
      )}

      {/* Key Figures Cards */}
      {keyFigures.length > 0 && (
        <div className="glanceSection" style={{ marginTop: '16px' }}>
          <div className="sectionHeader">KEY STATEMENT FIGURES</div>
          <div className="figuresGrid">
            {keyFigures.map((fig, idx) => (
              <div key={idx} className={`figureCard emp-${toText(fig?.emphasis, 'neutral')}`}>
                <div className="figLabel">{toText(fig?.label, `Item ${idx + 1}`)}</div>
                <div className="figValue">{toText(fig?.value, '—')}</div>
                {fig?.note && <div className="figNote">{toText(fig.note)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proportional Comparison Bars Panel */}
      {visualBreakdown.length > 0 && (
        <div className="glanceSection">
          <div className="sectionHeader">SEGMENT PROPORTIONS & ALLOCATIONS</div>
          <div className="barsPanel">
            {visualBreakdown.map((item, idx) => {
              const pct = toPercent(item?.share_percent)
              return (
                <div key={idx} className="barItem">
                  <div className="barTop">
                    <span className="barLabel">{toText(item?.label, `Segment ${idx + 1}`)}</span>
                    <span className="barValues">
                      {item?.amount && <strong className="barAmt">{toText(item.amount)}</strong>}
                      <span className="barPct">{pct}%</span>
                    </span>
                  </div>
                  <div className="barTrack">
                    <div
                      className="barFill"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${PALETTE[idx % PALETTE.length]}, #38bdf8)`
                      }}
                    />
                  </div>
                  {item?.detail && <div className="barDetail">{toText(item.detail)}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Plain English Translation Cards */}
      {plainEnglish.length > 0 && (
        <div className="glanceSection">
          <div className="sectionHeader">PLAIN-ENGLISH TRANSLATION</div>
          <div className="plainList">
            {plainEnglish.map((item, idx) => (
              <div key={idx} className="plainItem">
                <div className="plainTop">
                  <span className="clauseNum">{idx + 1}</span>
                  <span className="clauseTitle">{toText(item?.section, 'Statement Item')}</span>
                </div>
                <p className="clauseMeaning">{toText(item?.clear_meaning)}</p>
                {item?.takeaway && (
                  <div className="clauseTakeaway">
                    <span className="takeawayLabel">TAKEAWAY:</span> {toText(item.takeaway)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Watchouts / Risk Flags */}
      {watchouts.length > 0 && (
        <div className="glanceSection">
          <div className="sectionHeader">FLAGS & WATCHOUTS ({watchouts.length})</div>
          <div className="watchoutsGrid">
            {watchouts.map((w, idx) => {
              const sev = toText(w?.severity, 'medium').toLowerCase()
              return (
                <div key={idx} className={`watchoutCard sev-${sev}`}>
                  <div className="watchoutTop">
                    <span className={`sevBadge sev-${sev}`}>
                      {sev === 'high' ? '⚠️ HIGH IMPACT' : sev === 'low' ? 'ℹ️ LOW' : '⚡ ATTENTION'}
                    </span>
                    <span className="watchoutTitle">{toText(w?.title, 'Watchout Item')}</span>
                  </div>
                  {w?.impact && <p className="watchoutImpact">{toText(w.impact)}</p>}
                  {w?.action && (
                    <div className="watchoutAction">
                      <span className="actionTag">ACTION:</span> {toText(w.action)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recommended Next Actions */}
      {nextActions.length > 0 && (
        <div className="glanceSection">
          <div className="sectionHeader">RECOMMENDED NEXT ACTIONS</div>
          <ul className="nextActionsList">
            {nextActions.map((act, idx) => (
              <li key={idx} className="actionLi">
                <span className="actionNum">0{idx + 1}</span>
                <span className="actionText">{toText(act)}</span>
              </li>
            ))}
          </ul>
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
                💬 {toText(q)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
