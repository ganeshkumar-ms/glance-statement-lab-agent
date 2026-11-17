import React, { useEffect, useRef, useState } from 'react'
import GlanceSidebar from './components/GlanceSidebar.jsx'
import GlanceResultCard from './components/GlanceResultCard.jsx'
import DocumentViewer from './components/DocumentViewer.jsx'
import { analyzeStatement } from './services/api.js'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="errorRecoveryBox">
          <div className="errorRecoveryTitle">Display Recovery</div>
          <div className="errorRecoveryMsg">{this.state.error?.message || 'Unable to render this statement card.'}</div>
        </div>
      )
    }
    return this.props.children
  }
}

const STORAGE_KEY = 'glance_sessions_v1'

const GENERIC_GREETINGS = new Set([
  'hi', 'hello', 'hey', 'ji', 'hlo', 'yo', 'sup', 'namaste', 'hola', 'greetings',
  'good morning', 'good afternoon', 'good evening', 'how are you', 'how are u',
  'how r u', 'hows it going', 'whats up', 'ok', 'okay', 'thanks', 'thank you',
  'bro', 'dude', 'bhai', 'machan', 'yaar', 'buddy', 'man'
])

function isGreeting(text) {
  if (!text) return true
  const clean = text.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ')
  if (clean.length <= 2) return true
  if (GENERIC_GREETINGS.has(clean)) return true
  return /^(?:hi+|h[ea]y+|h[ea]llo+|hlo|hola|greetings?|yo+|sup|namaste|bro|dude|bhai|yaar|buddy)(?:\s+(?:there|glance|agent|bot|all|team|friend|buddy))?$/.test(clean) ||
         /^(?:(?:hi+|h[ea]y+|h[ea]llo+|hlo)\s+)?(?:how|hw)\s+(?:r|are|re)\s+(?:u|you|yu)(?:\s+doing)?$/.test(clean) ||
         /^(?:hru|whats?\s+up|hows?\s+it\s+going|hows?\s+u)$/.test(clean)
}

function shorten(str, max = 38) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max).trim() + '...' : str
}

function cleanTitle(str) {
  if (!str) return ''
  return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function deriveSmartTitle(userText, fileName, aiResponse) {
  try {
    if (aiResponse && aiResponse.type === 'statement_analysis' && typeof aiResponse.statement_title === 'string' && aiResponse.statement_title.trim()) {
      return shorten(cleanTitle(aiResponse.statement_title), 38)
    }

    if (fileName && typeof fileName === 'string') {
      const base = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim()
      if (base) {
        const formatted = base.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        return shorten(formatted, 38)
      }
    }

    if (userText && typeof userText === 'string' && !isGreeting(userText)) {
      let clean = userText.trim().replace(/\s+/g, ' ')
      clean = clean.replace(/^(?:can you|please|kindly|could you|would you|i want to|i need to|help me|can u|plz|tell me|explain|clarify|analyze|break down|simplify)\s+/i, '')
      clean = clean.replace(/^(?:this|the|my|our|an?|some)\s+/i, '')
      clean = clean.replace(/^[?:!.,-\s]+/, '')
      if (clean.length > 2) {
        const words = clean.split(' ').slice(0, 5).join(' ')
        const capitalized = words.charAt(0).toUpperCase() + words.slice(1)
        return shorten(capitalized, 38)
      }
    }
  } catch (e) {
    console.warn('deriveSmartTitle error:', e)
  }

  return 'New conversation'
}

function formatTimestamp(ts) {
  if (!ts) return 'TODAY'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return String(ts)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) {
    return `TODAY · ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } else if (diffDays === 1) {
    return 'YESTERDAY'
  }
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()
}

function getPreview(messages) {
  try {
    if (!messages || !Array.isArray(messages) || messages.length === 0) return 'Interactive statement clarity analysis.'
    const lastAi = [...messages].reverse().find(m => m?.role === 'ai')
    const headline = lastAi?.data?.headline_picture
    if (typeof headline === 'string' && headline.trim()) {
      return headline.slice(0, 90) + (headline.length > 90 ? '...' : '')
    }
    const msgTxt = lastAi?.data?.message
    if (typeof msgTxt === 'string' && msgTxt.trim()) {
      return msgTxt.slice(0, 90) + (msgTxt.length > 90 ? '...' : '')
    }
    const docMsg = messages.find(m => m?.file?.name)
    if (docMsg?.file?.name) {
      return `Attached statement: ${docMsg.file.name}`
    }
    const userMsg = messages.find(m => m?.role === 'user' && typeof m.content === 'string' && m.content && !isGreeting(m.content))
    if (userMsg?.content) {
      return userMsg.content.slice(0, 90) + (userMsg.content.length > 90 ? '...' : '')
    }
  } catch (e) {
    console.warn('getPreview error:', e)
  }
  return 'Interactive statement clarity and visual breakdown.'
}

export default function App() {
  const [view, setView] = useState('home')
  const [sessions, setSessions] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return []
      const list = JSON.parse(saved).filter(s => s.messages && s.messages.length > 0)
      return list.map(s => {
        let t = s.title || 'New conversation'
        if (!s.titleLocked) {
          const firstUser = (s.messages || []).find(m => m.role === 'user' && !isGreeting(m.content))
          const firstFile = (s.messages || []).find(m => m.file?.name)
          const firstAi = (s.messages || []).find(m => m.role === 'ai' && m.data?.type === 'statement_analysis')
          if (firstUser || firstFile || firstAi) {
            t = deriveSmartTitle(firstUser?.content, firstFile?.file?.name, firstAi?.data)
          } else if (isGreeting(t)) {
            t = 'New conversation'
          }
        }
        return { ...s, title: t }
      })
    } catch {
      return []
    }
  })

  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [title, setTitle] = useState('New conversation')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [inputVal, setInputVal] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeViewerDoc, setActiveViewerDoc] = useState(null)

  const fileInputRef = useRef(null)
  const homeFileInputRef = useRef(null)
  const messagesRef = useRef(null)

  useEffect(() => {
    // Strip transient blob: URLs before serializing to localStorage
    const cleanForStorage = sessions
      .filter(s => s.messages && s.messages.length > 0)
      .map(s => ({
        ...s,
        messages: s.messages.map(m =>
          m.file ? { ...m, file: { name: m.file.name, size: m.file.size, type: m.file.type } } : m
        )
      }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanForStorage))
  }, [sessions])

  const scrollToLatest = () => {
    setTimeout(() => {
      const container = messagesRef.current
      if (!container) return
      const lastMsg = messages[messages.length - 1]
      if (!loading && lastMsg?.role === 'ai') {
        const aiCards = container.querySelectorAll('.bubble.ai')
        const lastAi = aiCards[aiCards.length - 1]
        if (lastAi) {
          container.scrollTo({ top: Math.max(0, lastAi.offsetTop - 24), behavior: 'smooth' })
          return
        }
      }
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    }, 60)
  }

  useEffect(() => {
    if (view === 'chat') {
      scrollToLatest()
    }
  }, [messages, loading, view])

  function clearSelectedFile() {
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (homeFileInputRef.current) homeFileInputRef.current.value = ''
  }

  function handleNewChat() {
    setCurrentSessionId(null)
    setMessages([])
    setTitle('New conversation')
    setEditingTitle(false)
    setTitleDraft('')
    clearSelectedFile()
    setActiveViewerDoc(null)
    setView('chat')
  }

  function handleLoadSession(id) {
    const sess = sessions.find(s => s.id === id)
    if (!sess) return
    setCurrentSessionId(sess.id)
    setMessages(sess.messages || [])
    setTitle(sess.title || 'New conversation')
    setEditingTitle(false)
    setTitleDraft('')
    clearSelectedFile()
    setActiveViewerDoc(null)
    setView('chat')
  }

  function handleRenameSession(id, newTitle) {
    const clean = newTitle.trim() || 'New conversation'
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title: clean, titleLocked: true } : s))
    if (currentSessionId === id) {
      setTitle(clean)
    }
  }

  function commitTitle() {
    const clean = titleDraft.trim()
    if (clean && clean !== title) {
      setTitle(clean)
      if (currentSessionId) {
        handleRenameSession(currentSessionId, clean)
      }
    }
    setEditingTitle(false)
  }

  function handleDeleteSession(id) {
    setSessions(prev => prev.filter(s => s.id !== id))
    if (currentSessionId === id) {
      handleNewChat()
    }
  }

  function openDocument(fileObj, docMeta) {
    if (!fileObj && !docMeta) return
    const apiBase = import.meta.env.VITE_API_BASE || ''
    const remoteView = docMeta?.view_url
      ? (docMeta.view_url.startsWith('http') ? docMeta.view_url : `${apiBase}${docMeta.view_url}`)
      : null
    const remoteDownload = docMeta?.url
      ? (docMeta.url.startsWith('http') ? docMeta.url : `${apiBase}${docMeta.url}`)
      : null

    setActiveViewerDoc({
      name: docMeta?.filename || fileObj?.name || 'Statement Document',
      viewUrl: remoteView || fileObj?.localBlobUrl || null,
      downloadUrl: remoteDownload || fileObj?.localBlobUrl || null,
      preview: docMeta?.preview || '',
      rawMeta: docMeta || (fileObj ? { size: fileObj.size, content_type: fileObj.type } : null)
    })
  }

  function handleStartFromHome(initialText, file) {
    const newSessionId = 'glance_' + Date.now()
    setCurrentSessionId(newSessionId)
    setMessages([])
    const initialSmartTitle = deriveSmartTitle(initialText, file?.name, null)
    setTitle(initialSmartTitle)
    setView('chat')

    if (file || initialText) {
      executeSend(initialText, file, newSessionId, [], initialSmartTitle)
    }
  }

  async function executeSend(textToSend, fileToSend, targetSessionId, baseMessages = null, initialTitle = null) {
    const cleanText = (textToSend || '').trim()
    if (!cleanText && !fileToSend) return

    const currentList = baseMessages !== null ? baseMessages : messages
    const localUrl = fileToSend ? URL.createObjectURL(fileToSend) : null
    const userMsgId = 'usr_' + Date.now()

    const userMsg = {
      id: userMsgId,
      role: 'user',
      content: cleanText,
      file: fileToSend ? {
        name: fileToSend.name,
        size: fileToSend.size,
        type: fileToSend.type,
        localBlobUrl: localUrl
      } : null,
      docMeta: null
    }

    const updatedMessages = [...currentList, userMsg]
    setMessages(updatedMessages)
    setInputVal('')
    clearSelectedFile()
    setLoading(true)

    // Build prior conversation history BEFORE current user message for clean alternation
    const historyPayload = currentList
      .filter(m => m.role === 'user' || (m.role === 'ai' && m.data))
      .slice(-6)
      .map(m => ({
        role: m.role,
        content: m.role === 'user'
          ? (m.content || m.file?.name || '')
          : (m.data?.headline_picture || m.data?.message || 'GLANCE statement summary')
      }))

    try {
      const [result] = await Promise.all([
        analyzeStatement({
          file: fileToSend,
          text: cleanText,
          conversationHistory: historyPayload
        }),
        new Promise(res => setTimeout(res, 900))
      ])

      const serverDocMeta = result.document || null
      const syncedMessages = updatedMessages.map(m =>
        m.id === userMsgId && serverDocMeta ? { ...m, docMeta: serverDocMeta } : m
      )

      const aiMsg = {
        id: 'ai_' + Date.now(),
        role: 'ai',
        data: result
      }

      const finalMessages = [...syncedMessages, aiMsg]
      setMessages(finalMessages)

      const activeId = targetSessionId || currentSessionId || ('glance_' + Date.now())
      if (!currentSessionId) setCurrentSessionId(activeId)

      setSessions(prev => {
        const existing = prev.find(s => s.id === activeId)
        let newTitle = existing?.title || initialTitle || title

        if (!existing?.titleLocked) {
          const firstUser = finalMessages.find(m => m.role === 'user' && !isGreeting(m.content))
          const firstFile = finalMessages.find(m => m.file?.name)
          const firstAnalysis = finalMessages.find(m => m.role === 'ai' && m.data?.type === 'statement_analysis')

          if (firstUser || firstFile || firstAnalysis) {
            newTitle = deriveSmartTitle(firstUser?.content, firstFile?.file?.name, firstAnalysis?.data)
          } else {
            newTitle = 'New conversation'
          }
        }

        setTitle(newTitle)

        if (existing) {
          return prev.map(s => s.id === activeId ? {
            ...s,
            title: newTitle,
            messages: finalMessages,
            updatedAt: Date.now()
          } : s)
        }
        return [{
          id: activeId,
          title: newTitle,
          messages: finalMessages,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }, ...prev]
      })
    } catch (err) {
      const errorMsg = {
        id: 'err_' + Date.now(),
        role: 'ai',
        data: {
          type: 'chat',
          message: `GLANCE encountered an error: ${err.message || 'Unable to process statement. Please retry.'}`
        }
      }
      setMessages([...updatedMessages, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  function handleHomeSubmit(e) {
    e.preventDefault()
    const text = inputVal.trim()
    const file = selectedFile
    if (!text && !file) return
    handleStartFromHome(text, file)
  }

  function handleChatSubmit(e) {
    e.preventDefault()
    const text = inputVal.trim()
    const file = selectedFile
    if (!text && !file) return
    executeSend(text, file, currentSessionId)
  }

  return (
    <div className="app">
      <div className="aurora" />

      {view === 'home' && (
        <section id="home">
          <header>
            <div className="word">GLANCE</div>
            <button
              className="enter"
              id="enter"
              type="button"
              onClick={handleNewChat}
            >
              ENTER WORKSPACE ↗
            </button>
          </header>

          <main className="home">
            <div className="eyebrow">INTERACTIVE STATEMENT LAB</div>
            <h1>Complex statement.<br /><span>Clear picture.</span></h1>
            <p className="sub">
              Turn dense financial, banking, billing, tax, and policy statements into clear key figures, visual breakdowns, plain-English explanations, and actionable watchouts.
            </p>

            <div className="promptGlow">
              <form className="prompt" onSubmit={handleHomeSubmit}>
                <input
                  ref={homeFileInputRef}
                  className="fileInput"
                  type="file"
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.json,.xml,.txt,.md"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0])
                    }
                  }}
                />
                <button
                  className="startAttach"
                  type="button"
                  aria-label="Add file"
                  title="Attach statement (PDF, DOCX, XLSX, CSV, TXT)"
                  onClick={() => homeFileInputRef.current?.click()}
                >
                  <svg className="icon" viewBox="0 0 24 24" width="20" height="20">
                    <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.3-9.3a4 4 0 0 1 5.7 5.7l-9.3 9.3a2 2 0 0 1-2.8-2.8l8.6-8.6" />
                  </svg>
                </button>
                <input
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  placeholder="Ask GLANCE or attach a statement..."
                  aria-label="Start conversation"
                  autoFocus
                />
                <button className="send" type="submit" aria-label="Send">
                  <svg className="icon" viewBox="0 0 24 24" width="18" height="18">
                    <path d="M5 12h13" />
                    <path d="m13 7 5 5-5 5" />
                  </svg>
                </button>
              </form>
            </div>

            {selectedFile && (
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '8px auto 0' }}>
                <div className="filePill">
                  <span>Attached · {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  <button
                    className="filePillRemove"
                    type="button"
                    onClick={clearSelectedFile}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            <div className="recentGroup">
              <div className="recentHead">
                <span>RECENT CONVERSATIONS</span>
              </div>

              <div className="cards">
                {sessions.length === 0 ? (
                  <div className="card emptyCard">
                    <small>READY TO CLARIFY</small>
                    <b>No previous conversations yet</b>
                    <p>Paste any statement or attach a file above to see the clear picture.</p>
                  </div>
                ) : (
                  sessions.slice(0, 3).map(session => (
                    <button
                      key={session.id}
                      className="card"
                      type="button"
                      onClick={() => handleLoadSession(session.id)}
                    >
                      <small>{formatTimestamp(session.updatedAt || session.createdAt)}</small>
                      <b>{session.title || 'New conversation'}</b>
                      <p>{getPreview(session.messages)}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </main>
        </section>
      )}

      {view === 'chat' && (
        <section className="chatPage" id="chatPage">
          <div className={`layout${activeViewerDoc ? ' withViewer' : ''}`}>
            <GlanceSidebar
              sessions={sessions}
              currentSessionId={currentSessionId}
              onNew={handleNewChat}
              onLoad={handleLoadSession}
              onClose={() => setSidebarOpen(false)}
              isOpen={sidebarOpen}
              onRename={handleRenameSession}
              onDelete={handleDeleteSession}
            />

            <main className="chat">
              <div className="chatHead">
                <div>
                  {editingTitle ? (
                    <input
                      autoComplete="off"
                      autoFocus
                      className="titleInput"
                      value={titleDraft}
                      maxLength={60}
                      onChange={e => setTitleDraft(e.target.value)}
                      onBlur={commitTitle}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitTitle()
                        if (e.key === 'Escape') setEditingTitle(false)
                      }}
                    />
                  ) : (
                    <b
                      id="title"
                      className="titleEditable"
                      title="Click to rename"
                      onClick={() => {
                        setTitleDraft(title)
                        setEditingTitle(true)
                      }}
                    >
                      {title}
                    </b>
                  )}
                  <small>INTERACTIVE STATEMENT WORKSPACE</small>
                </div>

                <div className="mobileActions">
                  <button
                    className="mobileMenu"
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                  >
                    <svg className="icon" viewBox="0 0 24 24" width="16" height="16">
                      <path d="M5 7h14M5 12h14M5 17h14" />
                    </svg>
                    <span>RECENT</span>
                  </button>
                  <button
                    className="ghost"
                    id="back"
                    type="button"
                    onClick={() => setView('home')}
                  >
                    <svg className="icon" viewBox="0 0 24 24" width="16" height="16">
                      <path d="m3 10 9-7 9 7" />
                      <path d="M5 9v11h14V9" />
                      <path d="M9 20v-6h6v6" />
                    </svg>
                    <span style={{ marginLeft: '7px' }}>HOME</span>
                  </button>
                </div>
              </div>

              <div className="messages" id="messages" ref={messagesRef} aria-live="polite">
                {messages.length === 0 && (
                  <div className="card emptyCard" style={{ margin: '40px auto' }}>
                    <small>EMPTY WORKSPACE</small>
                    <b>No statements analyzed yet</b>
                    <p>Message GLANCE or attach a financial, billing, or policy statement below.</p>
                  </div>
                )}

                {messages.map(msg => {
                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className="bubble user">
                        {msg.file && (
                          <div className="userFileBadgeRow">
                            <div className="userFileMeta">
                              <svg className="icon" viewBox="0 0 24 24" width="14" height="14">
                                <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.3-9.3a4 4 0 0 1 5.7 5.7l-9.3 9.3a2 2 0 0 1-2.8-2.8l8.6-8.6" />
                              </svg>
                              <b>{msg.file.name}</b>
                              <span className="userFileSize">({(msg.file.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <button
                              type="button"
                              className="userFileViewBtn"
                              onClick={() => openDocument(msg.file, msg.docMeta)}
                            >
                              Open ↗
                            </button>
                          </div>
                        )}
                        {msg.content && <div>{msg.content}</div>}
                      </div>
                    )
                  }

                  if (msg.role === 'ai') {
                    return (
                      <div key={msg.id} className="bubble ai">
                        <ErrorBoundary>
                          <GlanceResultCard
                            data={msg.data}
                            guardrails={msg.data?.guardrails || msg.guardrails}
                            onFollowUp={(prompt) => executeSend(prompt, null, currentSessionId)}
                          />
                        </ErrorBoundary>
                      </div>
                    )
                  }

                  return null
                })}

                {loading && (
                  <div className="thinking">
                    <span className="thinkName">GLANCE</span>
                    <span className="bars">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                )}
              </div>

              <div className="composerArea">
                {selectedFile && (
                  <div style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '0 auto 10px' }}>
                    <div className="attachedRow composerAttached">
                      <span className="attachChip">
                        <span className="attachName">{selectedFile.name}</span>
                        <button
                          type="button"
                          className="attachRemove"
                          aria-label={`Remove ${selectedFile.name}`}
                          onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  </div>
                )}
                <div className="composer">
                  <form id="form" onSubmit={handleChatSubmit}>
                    <input
                      ref={fileInputRef}
                      className="fileInput"
                      type="file"
                      accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.json,.xml,.txt,.md"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setSelectedFile(e.target.files[0])
                        }
                      }}
                    />
                    <button
                      className="plus"
                      type="button"
                      aria-label="Add file"
                      title="Attach statement or billing document"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <svg className="icon" viewBox="0 0 24 24" width="18" height="18">
                        <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.3-9.3a4 4 0 0 1 5.7 5.7l-9.3 9.3a2 2 0 0 1-2.8-2.8l8.6-8.6" />
                      </svg>
                    </button>
                    <input
                      id="input"
                      value={inputVal}
                      onChange={e => setInputVal(e.target.value)}
                      placeholder="Message GLANCE or attach a statement..."
                      maxLength={1000}
                      autoComplete="off"
                      aria-label="Message"
                    />
                    <button className="chatSend" type="submit" aria-label="Send">
                      <svg className="icon" viewBox="0 0 24 24" width="18" height="18">
                        <path d="M5 12h13" />
                        <path d="m13 7 5 5-5 5" />
                      </svg>
                    </button>
                  </form>
                </div>
                <div className="fine">
                  ENTERPRISE BFSI · STATEMENT SIMPLIFIER · SECURE & SANITIZED
                </div>
              </div>
            </main>

            {activeViewerDoc && (
              <DocumentViewer
                doc={activeViewerDoc}
                onClose={() => setActiveViewerDoc(null)}
              />
            )}
          </div>
        </section>
      )}
    </div>
  )
}

