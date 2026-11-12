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

export default function GlanceResultCard({ data, onFollowUp }) {
  const [activeTab, setActiveTab] = useState('plain')

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

      {/* Key Figures */}
      {keyFigures.length > 0 && (
        <div className="glanceSection">
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

      {/* Visual Breakdown Bars */}
      {visualBreakdown.length > 0 && (
        <div className="glanceSection">
          <div className="sectionHeader">VISUAL PICTURE & BREAKDOWN</div>
          <div className="barsPanel">
            {visualBreakdown.map((item, idx) => {
              const pct = toPercent(item?.share_percent)
              return (
                <div key={idx} className="barItem">
                  <div className="barTop">
                    <span className="barLabel">{toText(item?.label, `Segment ${idx + 1}`)}</span>
                    <span className="barMeta">
                      {item?.amount ? <strong>{toText(item.amount)}</strong> : null}
                      <span>{pct}%</span>
                    </span>
                  </div>
                  <div className="barTrack">
                    <div className="barFill" style={{ width: `${Math.max(pct, 4)}%` }} />
                  </div>
                  {item?.detail && <div className="barDetail">{toText(item.detail)}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Interactive Tabs: Plain English / Watchouts / Next Actions */}
      {(plainEnglish.length > 0 || watchouts.length > 0 || nextActions.length > 0) && (
        <div className="glanceTabsWrap">
          <div className="glanceTabs">
            <button
              type="button"
              className={`gTab${activeTab === 'plain' ? ' active' : ''}`}
              onClick={() => setActiveTab('plain')}
            >
              Plain English ({plainEnglish.length})
            </button>
            <button
              type="button"
              className={`gTab${activeTab === 'flags' ? ' active' : ''}`}
              onClick={() => setActiveTab('flags')}
            >
              Watchouts ({watchouts.length})
            </button>
            <button
              type="button"
              className={`gTab${activeTab === 'actions' ? ' active' : ''}`}
              onClick={() => setActiveTab('actions')}
            >
              Next Actions ({nextActions.length})
            </button>
          </div>

          <div className="glanceTabBody">
            {activeTab === 'plain' && (
              plainEnglish.length === 0 ? (
                <div className="tabEmpty">No plain-English sections returned.</div>
              ) : (
                <div className="plainList">
                  {plainEnglish.map((item, idx) => (
                    <div key={idx} className="plainItem">
                      <div className="plainSecTitle">{toText(item?.section, `Section ${idx + 1}`)}</div>
                      <div className="plainMeaning">{toText(item?.clear_meaning)}</div>
                      {item?.takeaway && (
                        <div className="plainTakeaway">Takeaway: {toText(item.takeaway)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'flags' && (
              watchouts.length === 0 ? (
                <div className="tabEmpty">No hidden red flags or discrepancies detected.</div>
              ) : (
                <div className="flagsList">
                  {watchouts.map((w, idx) => {
                    const sev = toText(w?.severity, 'low').toLowerCase()
                    return (
                      <div key={idx} className={`flagItem sev-${sev}`}>
                        <div className="flagTop">
                          <span className={`sevTag sev-${sev}`}>{sev.toUpperCase()}</span>
                          <span className="flagTitle">{toText(w?.title, 'Watchout')}</span>
                        </div>
                        {w?.impact && <div className="flagImpact">{toText(w.impact)}</div>}
                        {w?.action && <div className="flagAction">Action: {toText(w.action)}</div>}
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {activeTab === 'actions' && (
              nextActions.length === 0 ? (
                <div className="tabEmpty">No immediate follow-up actions required.</div>
              ) : (
                <ul className="actionsList">
                  {nextActions.map((act, idx) => (
                    <li key={idx}>{toText(act)}</li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>
      )}

      {/* Clickable Suggested Follow-ups */}
      {followups.length > 0 && onFollowUp && (
        <div className="followupsRow">
          {followups.slice(0, 3).map((q, idx) => {
            const label = toText(q)
            if (!label) return null
            return (
              <button
                key={idx}
                type="button"
                className="followupChip"
                onClick={() => onFollowUp(label)}
              >
                {label} ↗
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

