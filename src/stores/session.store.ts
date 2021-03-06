import crypto from 'crypto'

import { dbDriver, SessionCollection } from '@lib'

export class SessionStore {
  private _sessionId: string = null

  public get sessionId() {
    return this._sessionId
  }

  public async newSession() {
    this._sessionId = crypto.randomBytes(4).toString('hex')
    const now = new Date().getTime()

    const session: SessionCollection = {
      last_run: now,
      sessionId: this.sessionId,
      start_time: now,
    }

    await dbDriver.session.save(session)
  }

  public async loadSession(sessionId: string) {
    this._sessionId = sessionId

    const session = await dbDriver.session.findOne({ sessionId })
    if (!session) throw new Error(`Invalid session id: ${sessionId}`)

    await dbDriver.session.updateOne({ sessionId }, { $set: { last_run: new Date().getTime() } })
  }
}

export const sessionStore = new SessionStore()
