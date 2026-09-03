import type { RecapData } from '@/lib/recap'

// Pure, hook-free presentational component — rendered both by react-dom (the preview page,
// scale=1) and by satori (the next/og ImageResponse route, scale=2 for a sharp download),
// so it stays flexbox-only with explicit dimensions throughout and every pixel value scales
// uniformly. No CSS grid, no shorthand satori doesn't support.
export default function RecapPoster({ data, scale = 1, interactive = false }: { data: RecapData; scale?: number; interactive?: boolean }) {
  const s = (n: number) => Math.round(n * scale)
  const red = '#C8102E'
  const dim = '#888'
  const faint = '#aaa'

  // Never spell out the raw URL as text — a PNG can't be clickable anyway, and in the
  // interactive preview the link itself carries the URL. Short call-to-action copy only.
  const ctaText = data.cta.kind === 'join'
    ? 'think you can do better? join the pool →'
    : data.cta.kind === 'nextRound'
    ? `${data.cta.roundLabel.toLowerCase()} picks lock ${data.cta.deadlineLabel} — lock in your picks →`
    : 'see the full standings →'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: s(560), background: 'white',
      padding: s(28), fontFamily: "'Inter', system-ui, sans-serif", color: '#111', fontSize: s(14),
    }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', fontWeight: 700, fontSize: s(16), color: red }}>pool'em</span>
          {data.dateLabel && <span style={{ display: 'flex', fontSize: s(11), color: faint }}>{data.dateLabel}</span>}
        </div>
        <div style={{ display: 'flex', fontWeight: 700, fontSize: s(22), marginTop: s(10) }}>{data.poolName}</div>
        <div style={{ display: 'flex', fontSize: s(13), color: dim, marginTop: s(2) }}>{data.roundLabel.toLowerCase()}</div>
      </div>

      {data.empty ? (
        <div style={{ display: 'flex', padding: `${s(48)}px 0`, justifyContent: 'center', fontSize: s(13), color: faint }}>
          nothing scored yet for this round
        </div>
      ) : (
        <>
          {/* Leaderboard — overall/season standings, not scoped to just this round. When
              ghostsOnly is set, this only lists the ghost entries — ranked either among
              themselves or by their real position in the general table, per rankBasis. */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: s(22) }}>
            <div style={{ display: 'flex', fontSize: s(10), fontWeight: 600, color: faint, textTransform: 'uppercase', letterSpacing: 1 }}>
              {data.ghostsOnly ? 'ghosts' : 'overall standings'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: s(8) }}>
              {data.leaderboard.map((row, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: `${s(7)}px 0`, borderTop: i === 0 ? 'none' : '1px solid #f2f2f0',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', fontSize: s(14), fontWeight: i === 0 ? 600 : 400 }}>
                    {data.ghostsOnly && (
                      row.avatar_url ? (
                        <img src={row.avatar_url} width={s(20)} height={s(20)} style={{ borderRadius: '50%', marginRight: s(7), objectFit: 'cover' }} />
                      ) : (
                        <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: s(20), height: s(20), borderRadius: '50%', background: '#f0f0ed',
                          fontSize: s(10), fontWeight: 700, color: '#bbb', marginRight: s(7),
                        }}>
                          {row.display_name.slice(0, 1).toUpperCase()}
                        </span>
                      )
                    )}
                    {row.rank}. {row.display_name}{row.is_ghost ? '*' : ''}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', fontSize: s(14), fontWeight: 600, color: i === 0 ? red : '#333' }}>
                    {row.points} pts
                    {row.games != null && data.gameUnit && (
                      <span style={{ display: 'flex', fontSize: s(10), fontWeight: 400, color: faint, marginLeft: s(5) }}>
                        · {row.games} {data.gameUnit}{row.games === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {data.ghostsOnly && data.rankBasis === 'overall' && data.otherCount != null && (
              <div style={{ display: 'flex', fontSize: s(10), color: faint, marginTop: s(6) }}>
                ranked against {data.otherCount} other{data.otherCount === 1 ? '' : 's'} in the general table.
              </div>
            )}
            {data.leaderboard.some(row => row.is_ghost) && (
              <div style={{ display: 'flex', fontSize: s(10), color: faint, marginTop: s(6) }}>
                * predictions are inputted by the admin based on weekly video predictions.
              </div>
            )}
          </div>

          {/* Recap items */}
          {data.items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: s(22) }}>
              <div style={{ display: 'flex', fontSize: s(10), fontWeight: 600, color: faint, textTransform: 'uppercase', letterSpacing: 1 }}>
                {data.roundLabel.toLowerCase()} recap
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: s(8) }}>
                {data.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', marginTop: i === 0 ? 0 : s(6) }}>
                    <span style={{ display: 'flex', fontSize: s(12), fontWeight: 700, color: item.hit ? '#2d7a2d' : red, marginRight: s(6) }}>
                      {item.hit ? '✓' : '✗'}
                    </span>
                    <span style={{ display: 'flex', fontSize: s(12), color: '#333' }}>
                      {item.label}{item.result ? ` (${item.result})` : ''} — {item.pickSummary}
                    </span>
                  </div>
                ))}
                {data.itemsOverflow > 0 && (
                  <div style={{ display: 'flex', fontSize: s(11), color: faint, marginTop: s(6) }}>+ {data.itemsOverflow} more</div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer CTA — interactive=true (preview) makes this a real clickable link; the
          PNG can never be clickable, so it just shows the same short copy with no URL. */}
      <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid #eee', marginTop: s(22), paddingTop: s(16) }}>
        {interactive ? (
          <a href={data.cta.link} style={{ display: 'flex', fontSize: s(13), fontWeight: 600, color: red, textDecoration: 'none' }}>
            {ctaText}
          </a>
        ) : (
          <div style={{ display: 'flex', fontSize: s(13), fontWeight: 600, color: red }}>{ctaText}</div>
        )}
        <div style={{ display: 'flex', fontSize: s(10), color: faint, marginTop: s(6) }}>made with pool'em</div>
      </div>
    </div>
  )
}
