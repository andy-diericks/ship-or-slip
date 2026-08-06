import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import type { ChangeEvent } from '../lib/types';
import { EVENT_META } from '../lib/types';

/** The three movements worth watching over time; the rest is noise at this altitude. */
const SERIES = [
  { key: 'slipped', label: 'Slipped', token: '--slip' },
  { key: 'shipped', label: 'Shipped', token: '--ship' },
  { key: 'dropped', label: 'Dropped', token: '--drop' },
] as const;

interface Bucket {
  week: string;
  slipped: number;
  shipped: number;
  dropped: number;
}

/**
 * Bucket events into ISO weeks (Monday-anchored, UTC).
 *
 * Weeks rather than days: the pipeline runs four times a day and Microsoft
 * publishes in bursts, so a daily chart is mostly empty columns punctuated by
 * spikes that say more about the publishing calendar than about the roadmap.
 */
export function bucketByWeek(events: ChangeEvent[]): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (const event of events) {
    if (!SERIES.some((s) => s.key === event.type)) continue;
    const date = new Date(event.ts);
    if (Number.isNaN(date.getTime())) continue;
    const monday = new Date(date);
    // getUTCDay() is 0 on Sunday, which belongs to the week that began six days earlier.
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const week = monday.toISOString().slice(0, 10);
    const bucket = buckets.get(week) ?? { week, slipped: 0, shipped: 0, dropped: 0 };
    bucket[event.type as keyof Omit<Bucket, 'week'>] += 1;
    buckets.set(week, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/** Read a design token at render time so the chart follows the active theme. */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Default-exported as well as named so `App` can lazy-load it: Recharts is by
 * far the largest dependency, and the chart sits below the fold behind a
 * "needs at least two weeks of data" guard. Splitting it keeps the first paint
 * to the feed, which is what people come for.
 */
export function ActivityChart({ events }: { events: ChangeEvent[] }) {
  const data = bucketByWeek(events);

  // One column is not a trend. Below two weeks the tiles say it better.
  if (data.length < 2) return null;

  const axis = token('--muted', '#93a4be');
  const grid = token('--border', '#22304d');

  return (
    <section className="panel">
      <h2 className="panel__title">Movements per week</h2>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis
              dataKey="week"
              tick={{ fill: axis, fontSize: 12 }}
              tickFormatter={(v: string) => v.slice(5)}
              stroke={grid}
            />
            <YAxis tick={{ fill: axis, fontSize: 12 }} stroke={grid} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: token('--surface', '#131c31'),
                border: `1px solid ${grid}`,
                borderRadius: 8,
                color: token('--text', '#e6edf7'),
              }}
              labelFormatter={(label) => `Week of ${String(label)}`}
              cursor={{ fill: grid, opacity: 0.3 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: axis }} />
            {SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={EVENT_META[series.key].label}
                stackId="a"
                fill={token(series.token, '#38bdf8')}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default ActivityChart;
