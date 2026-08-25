import { useMemo, useState } from 'react';
import { BodyFigure, MuscleThumb } from './BodyMap';
import {
  muscleGroups,
  muscleLabels,
  muscleVolume,
  tierLabels,
  unmappedExercises,
  type MuscleGroup,
  type MuscleTier
} from './lib/muscles';
import type { StrengthSession } from './types';

type Window = 'today' | 'week';

/** Tier colours, shared by the figures, the pips and the legend. */
const tierColors: Record<MuscleTier, string> = {
  untrained: 'rgba(222, 222, 222, 0.10)',
  maintaining: '#f2b823',
  growing: '#3b82f6',
  focus: '#22c55e'
};

export default function BodyView({
  date,
  strength,
  onGo
}: {
  date: string;
  strength: StrengthSession[];
  onGo: (tab: 'training') => void;
}) {
  const [window, setWindow] = useState<Window>('week');
  const [selected, setSelected] = useState<MuscleGroup | null>(null);

  const days = useMemo(() => windowDays(date, window), [date, window]);
  const sessions = useMemo(() => strength.filter((entry) => days.includes(entry.date)), [strength, days]);

  const volume = useMemo(() => muscleVolume(sessions, window), [sessions, window]);
  const unmapped = useMemo(() => unmappedExercises(sessions), [sessions]);

  const fills = useMemo(() => {
    const map = {} as Record<MuscleGroup, string>;
    for (const group of muscleGroups) map[group] = tierColors[volume[group].tier];
    return map;
  }, [volume]);

  const trained = muscleGroups.filter((group) => volume[group].sets > 0);
  const ranked = [...muscleGroups].sort((a, b) => volume[b].sets - volume[a].sets);

  return (
    <section className="stack view body-view">
      <div className="panel body-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{window === 'today' ? 'Today' : 'This week'}</p>
            <h2>{trained.length ? `${trained.length} muscle${trained.length === 1 ? '' : 's'} worked` : 'Nothing logged yet'}</h2>
          </div>
          <div className="range-toggle">
            <button className={window === 'today' ? 'active' : ''} onClick={() => setWindow('today')}>Today</button>
            <button className={window === 'week' ? 'active' : ''} onClick={() => setWindow('week')}>Week</button>
          </div>
        </div>

        <div className="body-figures">
          <BodyFigure side="front" fills={fills} onSelect={setSelected} selected={selected} />
          <BodyFigure side="back" fills={fills} onSelect={setSelected} selected={selected} />
        </div>

        <div className="body-legend">
          {(['maintaining', 'growing', 'focus'] as MuscleTier[]).map((tier) => (
            <span key={tier}>
              <i style={{ background: tierColors[tier] }} />
              {tierLabels[tier]}
            </span>
          ))}
        </div>

        {trained.length ? null : (
          <p className="body-empty-note">
            Log a workout on the Train tab and the muscles you hit will light up here.{' '}
            <button className="text-button" onClick={() => onGo('training')}>Go to Train</button>
          </p>
        )}
      </div>

      {ranked.map((group) => {
        const entry = volume[group];
        return (
          <button
            key={group}
            className={`panel muscle-row ${selected === group ? 'selected' : ''} ${entry.sets ? '' : 'idle'}`}
            onClick={() => setSelected(selected === group ? null : group)}
          >
            <div className="muscle-row-head">
              <div>
                <h2>{muscleLabels[group]}</h2>
                <p>
                  {window === 'today' ? (
                    <>
                      <strong>{entry.sets}</strong> set{entry.sets === 1 ? '' : 's'} today
                    </>
                  ) : (
                    <>
                      <strong>{entry.sets}</strong> of {entry.target} weekly sets
                    </>
                  )}
                </p>
              </div>
              <span className="muscle-row-note">
                {entry.sets === 0 ? 'Not touched' : entry.setsToFocus ? `${entry.setsToFocus} more to go hard` : tierLabels[entry.tier]}
              </span>
            </div>
            <div className="muscle-row-body">
              <MuscleThumb group={group} color={tierColors[entry.tier]} />
              <div className="set-pips">
                {Array.from({ length: Math.max(entry.target, entry.sets) }, (_, index) => (
                  <i key={index} className={index < entry.sets ? 'done' : ''} style={index < entry.sets ? { background: tierColors[entry.tier] } : undefined} />
                ))}
              </div>
            </div>
          </button>
        );
      })}

      {unmapped.length ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Couldn’t place these</p>
              <h2>{unmapped.length} exercise{unmapped.length === 1 ? '' : 's'} not counted</h2>
            </div>
          </div>
          <p className="hint">
            {unmapped.length === 1
              ? 'We don’t know which muscle this one works, so it’s left out of the map. Renaming it to something closer to a standard exercise will fix that.'
              : 'We don’t know which muscles these work, so they’re left out of the map. Renaming them to something closer to standard exercises will fix that.'}
          </p>
          <div className="unmapped-list">
            {unmapped.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Today, or the calendar week (Monday first) containing the selected date. */
function windowDays(anchor: string, window: Window) {
  if (window === 'today') return [anchor];
  const date = new Date(`${anchor}T00:00:00`);
  const weekday = date.getDay();
  const start = new Date(date);
  start.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const d = String(day.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
}
