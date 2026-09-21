import { useEffect, useState } from 'react'
import { setUnauthorizedHandler } from './api'
import Login from './components/Login'
import Inbox from './components/Inbox'
import { User } from './types'

export default function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('token') || '')
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  })

  const onLogin = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const onLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken('')
    setUser(null)
  }

  // An expired or revoked token sends the user back to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(onLogout)
    return () => setUnauthorizedHandler(null)
  }, [])

  if (!token || !user) {
    return <Login onLogin={onLogin} />
  }

  return (
    <div className="app">
      <div className="marquee">
        <span className="marquee-text">
          🚀🔥 WELCOME 2 PULSE™ — THE #1 FEEDBACK INBOX ON THE INFORMATION SUPERHIGHWAY!!! 🔥🚀 ⭐
          best viewed in Netscape Navigator @ 800×600 ⭐ don't forget to sign our guestbook!!!
          👽💾📠✨
        </span>
      </div>
      <header className="topbar">
        <h1>💖 Pulse 💖</h1>
        <div className="topbar-right">
          <span className="topbar-user">{user.name}</span>
          <button className="link-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>
      <Inbox token={token} />
    </div>
  )
}
