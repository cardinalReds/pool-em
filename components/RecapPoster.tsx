import type { RecapData } from '@/lib/recap'

// Pure, hook-free presentational component — rendered both by react-dom (the preview page,
// scale=1) and by satori (the next/og ImageResponse route, scale=2 for a sharp download),
// so it stays flexbox-only with explicit dimensions throughout and every pixel value scales
// uniformly. No CSS grid, no `gap` (unsupported in older satori), no shorthand satori
// doesn't support.
export default function RecapPoster({ data, scale = 1, interactive = false }: { data: RecapData; scale?: number; interactive?: boolean }) {
  const s = (n: number) => Math.round(n * scale)
  const red = '#C8102E'
  const dim = '#888'
  const faint = '#aaa'
  const gold = '#B8860B'

  // Never spell out the raw URL as text — a PNG can't be clickable anyway, and in the
  // interactive preview the link itself carries the URL. Short call-to-action copy only.
  const ctaText = data.cta.kind === 'join'
    ? 'think you can do better? join the pool →'
    : data.cta.kind === 'nextRound'
    ? `${data.cta.roundLabel.toLowerCase()} picks lock ${data.cta.deadlineLabel} — lock in your picks →`
    : 'see the full standings →'

  const secondaryLabel = data.scope === 'round' ? 'season' : 'this wk'
  const secondaryColor = data.scope === 'round' ? faint : (data.leaderboard.some(r => r.secondaryPoints > 0) ? '#2d7a2d' : faint)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', width: s(560), background: 'white',
      fontFamily: "'Inter', system-ui, sans-serif", color: '#111', fontSize: s(14),
    }}>
      {/* Top accent bar — shelf presence, reads as a designed card, not a screenshot */}
      <div style={{ display: 'flex', width: s(560), height: s(5), background: red }} />

      {/* flexWrap: nowrap here matters — satori's default flexWrap is 'wrap' (unlike
          browsers' 'nowrap'), and if a column-direction container's content exceeds the
          height ImageResponse was given, it silently starts a second COLUMN side-by-side
          instead of overflowing — the standings and recap-items blocks below rendered next
          to each other instead of stacked until this was set explicitly. */}
      <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', padding: `${s(18)}px ${s(24)}px ${s(20)}px` }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', fontWeight: 700, fontSize: s(16), color: red }}>pool'em</span>
            {data.dateLabel && <span style={{ display: 'flex', fontSize: s(11), color: faint }}>{data.dateLabel}</span>}
          </div>
          <div style={{ display: 'flex', fontWeight: 700, fontSize: s(22), marginTop: s(9), lineHeight: 1.15 }}>{data.poolName}</div>
          <div style={{ display: 'flex', marginTop: s(7) }}>
            <span style={{
              display: 'flex', fontSize: s(11), fontWeight: 700, color: red, background: '#fff0f0',
              padding: `${s(3)}px ${s(9)}px`, borderRadius: s(20), textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {data.roundLabel}
            </span>
          </div>
        </div>

        {data.empty ? (
          <div style={{ display: 'flex', padding: `${s(48)}px 0`, justifyContent: 'center', fontSize: s(13), color: faint }}>
            nothing scored yet for this round
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'nowrap' }}>
            {/* Leaderboard — scoped to season total or just this round per data.scope. When
                ghostsOnly is set, this only lists the ghost entries — ranked either among
                themselves or by their real position in the general table, per rankBasis. */}
            <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', marginTop: s(16) }}>
              <div style={{ display: 'flex', fontSize: s(10), fontWeight: 600, color: faint, textTransform: 'uppercase', letterSpacing: 1 }}>
                {data.ghostsOnly ? 'ghosts' : 'standings'}{data.scope === 'round' ? ` — ${data.roundLabel.toLowerCase()}` : ''}
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', marginTop: s(6),
                border: '1px solid #efefec', borderRadius: s(8), overflow: 'hidden',
              }}>
                {data.leaderboard.map((row, i) => {
                  const isFirst = row.rank === 1
                  return (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: `${s(7)}px ${s(12)}px`,
                      background: isFirst ? '#fdf8ee' : 'white',
                      borderTop: i === 0 ? 'none' : '1px solid #f2f2f0',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', fontSize: s(14), fontWeight: isFirst ? 700 : 400 }}>
                        <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: s(18), fontSize: s(13), fontWeight: 700, color: isFirst ? gold : faint, marginRight: s(6),
                        }}>
                          {isFirst ? '👑' : row.rank}
                        </span>
                        {data.ghostsOnly && (
                          row.avatar_url ? (
                            <img src={row.avatar_url} width={s(22)} height={s(22)} style={{ borderRadius: '50%', marginRight: s(8), objectFit: 'cover' }} />
                          ) : (
                            <span style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: s(22), height: s(22), borderRadius: '50%', background: '#f0f0ed',
                              fontSize: s(10), fontWeight: 700, color: '#bbb', marginRight: s(8),
                            }}>
                              {row.display_name.slice(0, 1).toUpperCase()}
                            </span>
                          )
                        )}
                        {row.display_name}{row.is_ghost ? '*' : ''}
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', alignItems: 'flex-end' }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', fontSize: s(15), fontWeight: 700, color: isFirst ? red : '#222' }}>
                          {row.points}
                          <span style={{ display: 'flex', fontSize: s(10), fontWeight: 400, color: faint, marginLeft: s(3) }}>pts</span>
                        </span>
                        <span style={{ display: 'flex', fontSize: s(10), color: secondaryColor, marginTop: s(1) }}>
                          {data.scope === 'round'
                            ? `${secondaryLabel} ${row.secondaryPoints}`
                            : `${row.secondaryPoints > 0 ? '+' : ''}${row.secondaryPoints} ${secondaryLabel}`}
                          {row.games != null && data.gameUnit && ` · ${row.games} ${data.gameUnit}${row.games === 1 ? '' : 's'}`}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
              {data.ghostsOnly && data.rankBasis === 'overall' && data.otherCount != null && (
                <div style={{ display: 'flex', fontSize: s(10), color: faint, marginTop: s(5) }}>
                  ranked against {data.otherCount} other{data.otherCount === 1 ? '' : 's'} in the general table.
                </div>
              )}
              {data.leaderboard.some(row => row.is_ghost) && (
                <div style={{ display: 'flex', fontSize: s(10), color: faint, marginTop: s(5) }}>
                  * predictions are inputted by the admin based on weekly video predictions.
                </div>
              )}
            </div>

            {/* Recap items */}
            {data.items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', marginTop: s(16) }}>
                <div style={{ display: 'flex', fontSize: s(10), fontWeight: 600, color: faint, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {data.roundLabel.toLowerCase()} recap
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', marginTop: s(6) }}>
                  {data.items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', marginTop: i === 0 ? 0 : s(5) }}>
                      <span style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: s(16), height: s(16), borderRadius: '50%', flexShrink: 0,
                        background: item.hit ? '#e9f7ea' : '#fdeaea',
                        fontSize: s(10), fontWeight: 700, color: item.hit ? '#2d7a2d' : red, marginRight: s(7), marginTop: s(1),
                      }}>
                        {item.hit ? '✓' : '✗'}
                      </span>
                      {/* Lead with the pick fact, then the verdict, then the score as
                          context — "9 of 14 picked Liverpool, nailed it, final 2-0" reads
                          as a story; the old "Liverpool 2-0 Chelsea — 9 of 14 picked
                          Liverpool" buried the interesting part (what people guessed and
                          whether they were right) behind the score. */}
                      <span style={{ display: 'flex', flexWrap: 'wrap', fontSize: s(12), color: '#333' }}>
                        <span style={{ fontWeight: 600 }}>{item.pickSummary}</span>
                        <span style={{ color: item.hit ? '#2d7a2d' : red, fontWeight: 600, marginLeft: s(4) }}>
                          {item.hit ? '— nailed it' : '— missed'}
                        </span>
                        <span style={{ color: faint, marginLeft: s(4) }}>
                          ({item.label}{item.result ? `, ${item.result}` : ''})
                        </span>
                      </span>
                    </div>
                  ))}
                  {data.itemsOverflow > 0 && (
                    <div style={{ display: 'flex', fontSize: s(11), color: faint, marginTop: s(5) }}>+ {data.itemsOverflow} more</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer CTA — a real button, not a text link, since this is the one thing meant
            to convert a viewer into a player. interactive=true (preview) makes it a real
            clickable link; the PNG can never be clickable, so it just keeps the button look
            with no href. */}
        <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'nowrap', marginTop: s(16) }}>
          {interactive ? (
            <a href={data.cta.link} style={{ textDecoration: 'none', display: 'flex' }}>
              <div style={{
                display: 'flex', width: s(560 - 48), justifyContent: 'center', alignItems: 'center',
                background: red, color: 'white', fontSize: s(13), fontWeight: 700,
                padding: `${s(10)}px 0`, borderRadius: s(6),
              }}>
                {ctaText}
              </div>
            </a>
          ) : (
            <div style={{
              display: 'flex', width: s(560 - 48), justifyContent: 'center', alignItems: 'center',
              background: red, color: 'white', fontSize: s(13), fontWeight: 700,
              padding: `${s(10)}px 0`, borderRadius: s(6),
            }}>
              {ctaText}
            </div>
          )}
          <div style={{ display: 'flex', fontSize: s(10), color: faint, marginTop: s(8), justifyContent: 'center' }}>made with pool'em</div>
        </div>
      </div>
    </div>
  )
}
