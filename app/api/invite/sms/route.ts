import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { phone, poolName, inviteUrl } = await req.json()
  if (!phone || !inviteUrl) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({ error: 'SMS not configured' }, { status: 500 })
  }

  const message = `You've been invited to join "${poolName}" on pool'em! Click here to join: ${inviteUrl}`

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, From: fromNumber, Body: message }),
  })

  if (!res.ok) {
    const err = await res.json()
    console.error('Twilio error:', err)
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
