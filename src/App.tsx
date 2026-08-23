import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Activity,
  Apple,
  Beef,
  Bike,
  Camera,
  Carrot,
  ChevronLeft,
  ChevronRight,
  Drumstick,
  Dumbbell,
  Egg,
  Eye,
  EyeOff,
  Fish,
  Flame,
  Footprints,
  Home,
  Loader2,
  LogOut,
  Milk,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  Utensils,
  Weight,
  Wheat,
  X
} from 'lucide-react';
import { calculateTargets, defaultProfile, mealTypes, scaleNutrients, seedFoods, sumNutrients } from './lib/nutrition';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import { loadLocal, prettyDate, saveLocal, todayKey, uid, type LocalState } from './lib/store';
import type {
  BodyMetric,
  CardioEntry,
  Food,
  MealEntry,
  MealType,
  ProgressPhoto,
  SavedMeal,
  StepEntry,
  StrengthExercise,
  StrengthSession,
  ProgramDay,
  TrainingProgram,
  UserProfile
} from './types';

type Tab = 'today' | 'food' | 'training' | 'cardio' | 'progress' | 'profile';

const templateSeeds: Record<string, string[]> = {
  Push: ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Lateral Raise', 'Triceps Pushdown'],
  Pull: ['Deadlift', 'Lat Pulldown', 'Barbell Row', 'Face Pull', 'Barbell Curl'],
  Legs: ['Back Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Standing Calf Raise'],
  Upper: ['Bench Press', 'Barbell Row', 'Overhead Press', 'Lat Pulldown', 'EZ Bar Curl'],
  Lower: ['Back Squat', 'Romanian Deadlift', 'Leg Extension', 'Leg Curl', 'Seated Calf Raise']
};

const weekDays = [
  { label: 'Mon', full: 'Monday' },
  { label: 'Tue', full: 'Tuesday' },
  { label: 'Wed', full: 'Wednesday' },
  { label: 'Thu', full: 'Thursday' },
  { label: 'Fri', full: 'Friday' },
  { label: 'Sat', full: 'Saturday' },
  { label: 'Sun', full: 'Sunday' }
];

const initialState: LocalState = {
  profile: defaultProfile(),
  meals: [],
  savedMeals: [],
  strength: [],
  programs: [],
  cardio: [],
  steps: [],
  body: [],
  photos: []
};

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState(todayKey());
  const [state, setState] = useState<LocalState>(() => {
    const saved = loadLocal<Partial<LocalState>>('state', initialState);
    return { ...initialState, ...saved, programs: saved.programs || [] };
  });
  const [session, setSession] = useState<Session | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [localMode, setLocalMode] = useState(!hasSupabaseConfig);
  const [toast, setToast] = useState('');

  const todaysMeals = useMemo(() => state.meals.filter((entry) => entry.date === date), [state.meals, date]);
  const todaysTotals = useMemo(() => sumNutrients(todaysMeals), [todaysMeals]);
  const todaysStrength = state.strength.find((item) => item.date === date);
  const todaysCardio = state.cardio.filter((item) => item.date === date);
  const todaysSteps = state.steps.find((item) => item.date === date)?.steps || 0;
  const latestBody = [...state.body].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const pageTitles: Record<Tab, string> = {
    today: 'Daily overview',
    food: 'Nutrition',
    training: 'Training log',
    cardio: 'Cardio & steps',
    progress: 'Progress',
    profile: 'Your plan'
  };
  const firstName = state.profile.name.trim().split(/\s+/)[0] || 'there';

  useEffect(() => {
    if (!localMode) saveLocal('state', state);
    if (localMode) saveLocal('state', state);
  }, [state, localMode]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session || localMode) return;
    void loadRemote(session.user.id);
  }, [session, localMode]);

  function commit(next: LocalState) {
    setState(next);
    saveLocal('state', next);
  }

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  }

  async function loadRemote(userId: string) {
    if (!supabase) return;
    const client = supabase;
    setRemoteLoading(true);
    try {
      const [profileRes, mealsRes, savedRes, strengthRes, programsRes, cardioRes, stepsRes, bodyRes, photosRes] = await Promise.all([
        client.from('profiles').select('*').eq('id', userId).maybeSingle(),
        client.from('meal_entries').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('saved_meals').select('*').eq('user_id', userId),
        client.from('strength_sessions').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('training_programs').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
        client.from('cardio_entries').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('step_entries').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('body_metrics').select('*').eq('user_id', userId).order('log_date', { ascending: false }),
        client.from('progress_photos').select('*').eq('user_id', userId).order('log_date', { ascending: false })
      ]);

      const profile = profileRes.data
        ? profileFromRow(profileRes.data)
        : { ...state.profile, id: userId, name: session?.user.email?.split('@')[0] || 'You' };

      const photos = await Promise.all(
        (photosRes.data || []).map(async (row: any) => {
          const signed = await client.storage.from('progress-photos').createSignedUrl(row.storage_path, 60 * 60 * 24 * 7);
          return {
            id: row.id,
            date: row.log_date,
            label: row.label || 'Progress',
            url: signed.data?.signedUrl || ''
          };
        })
      );

      commit({
        profile,
        meals: (mealsRes.data || []).map(mealFromRow),
        savedMeals: (savedRes.data || []).map((row: any) => ({ id: row.id, name: row.name, items: row.items || [] })),
        strength: (strengthRes.data || []).map((row: any) => ({
          id: row.id,
          date: row.log_date,
          templateName: row.template_name,
          exercises: row.exercises || [],
          notes: row.notes || ''
        })),
        programs: (programsRes.data || []).map((row: any) => ({ id: row.id, name: row.name, days: row.days || [] })),
        cardio: (cardioRes.data || []).map((row: any) => ({
          id: row.id,
          date: row.log_date,
          type: row.type,
          durationMin: row.duration_min,
          distanceKm: row.distance_km || undefined,
          calories: row.calories || undefined
        })),
        steps: (stepsRes.data || []).map((row: any) => ({ id: row.id, date: row.log_date, steps: row.steps })),
        body: (bodyRes.data || []).map((row: any) => ({
          id: row.id,
          date: row.log_date,
          weightKg: row.weight_kg || undefined,
          waistCm: row.waist_cm || undefined,
          bodyFatPercent: row.body_fat_percent || undefined
        })),
        photos
      });
    } finally {
      setRemoteLoading(false);
    }
  }

  async function upsertProfile(profile: UserProfile) {
    commit({ ...state, profile });
    if (supabase && session && !localMode) {
      await supabase.from('profiles').upsert(profileToRow(profile));
    }
    flash('Profile saved');
  }

  async function addMeal(entry: MealEntry) {
    commit({ ...state, meals: [entry, ...state.meals] });
    if (supabase && session && !localMode) {
      await supabase.from('meal_entries').insert(mealToRow(entry, session.user.id));
    }
    flash('Food logged');
  }

  async function deleteMeal(id: string) {
    commit({ ...state, meals: state.meals.filter((entry) => entry.id !== id) });
    if (supabase && session && !localMode) {
      await supabase.from('meal_entries').delete().eq('id', id);
    }
  }

  async function saveMeal(savedMeal: SavedMeal) {
    const savedMeals = [savedMeal, ...state.savedMeals.filter((item) => item.id !== savedMeal.id)];
    commit({ ...state, savedMeals });
    if (supabase && session && !localMode) {
      await supabase.from('saved_meals').upsert({ id: savedMeal.id, user_id: session.user.id, name: savedMeal.name, items: savedMeal.items });
    }
    flash('Meal saved');
  }

  async function logSavedMeal(savedMeal: SavedMeal, mealType: MealType) {
    const entries = savedMeal.items.map<MealEntry>((item) => ({
      id: uid('meal'),
      date,
      mealType,
      food: item.food,
      grams: item.grams,
      nutrients: scaleNutrients(item.food.nutrientsPer100g, item.grams),
      createdAt: new Date().toISOString()
    }));
    commit({ ...state, meals: [...entries, ...state.meals] });
    if (supabase && session && !localMode) {
      await supabase.from('meal_entries').insert(entries.map((entry) => mealToRow(entry, session.user.id)));
    }
    flash('Saved meal logged');
  }

  async function saveStrength(sessionEntry: StrengthSession) {
    const strength = [sessionEntry, ...state.strength.filter((entry) => entry.id !== sessionEntry.id && entry.date !== sessionEntry.date)];
    commit({ ...state, strength });
    if (supabase && session && !localMode) {
      await supabase.from('strength_sessions').upsert({
        id: sessionEntry.id,
        user_id: session.user.id,
        log_date: sessionEntry.date,
        template_name: sessionEntry.templateName,
        exercises: sessionEntry.exercises,
        notes: sessionEntry.notes || null
      });
    }
    flash('Workout saved');
  }

  async function saveProgram(program: TrainingProgram) {
    const programs = [program, ...state.programs.filter((entry) => entry.id !== program.id)];
    commit({ ...state, programs });
    if (supabase && session && !localMode) {
      await supabase.from('training_programs').upsert({ id: program.id, user_id: session.user.id, name: program.name, days: program.days });
    }
    flash('Program saved');
  }

  async function saveCardio(entry: CardioEntry) {
    commit({ ...state, cardio: [entry, ...state.cardio] });
    if (supabase && session && !localMode) {
      await supabase.from('cardio_entries').insert({
        id: entry.id,
        user_id: session.user.id,
        log_date: entry.date,
        type: entry.type,
        duration_min: entry.durationMin,
        distance_km: entry.distanceKm || null,
        calories: entry.calories || null
      });
    }
    flash('Cardio saved');
  }

  async function saveSteps(steps: number) {
    const entry: StepEntry = state.steps.find((item) => item.date === date) || { id: uid('steps'), date, steps };
    entry.steps = steps;
    commit({ ...state, steps: [entry, ...state.steps.filter((item) => item.date !== date)] });
    if (supabase && session && !localMode) {
      await supabase.from('step_entries').upsert({ id: entry.id, user_id: session.user.id, log_date: date, steps });
    }
    flash('Steps saved');
  }

  async function saveBody(entry: BodyMetric) {
    commit({ ...state, body: [entry, ...state.body.filter((item) => item.date !== entry.date)] });
    if (supabase && session && !localMode) {
      await supabase.from('body_metrics').upsert({
        id: entry.id,
        user_id: session.user.id,
        log_date: entry.date,
        weight_kg: entry.weightKg || null,
        waist_cm: entry.waistCm || null,
        body_fat_percent: entry.bodyFatPercent || null
      });
    }
    flash('Body metric saved');
  }

  async function savePhoto(file: File, label: string) {
    let url = URL.createObjectURL(file);
    const id = uid('photo');
    if (supabase && session && !localMode) {
      const path = `${session.user.id}/${date}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
      const upload = await supabase.storage.from('progress-photos').upload(path, file, { upsert: true });
      if (!upload.error) {
        await supabase.from('progress_photos').insert({ id, user_id: session.user.id, log_date: date, label, storage_path: path });
        const signed = await supabase.storage.from('progress-photos').createSignedUrl(path, 60 * 60 * 24 * 7);
        url = signed.data?.signedUrl || url;
      }
    }
    commit({ ...state, photos: [{ id, date, label, url }, ...state.photos] });
    flash('Photo added');
  }

  const authenticated = localMode || !hasSupabaseConfig || Boolean(session);

  if (!authenticated) {
    return <AuthScreen onLocal={() => setLocalMode(true)} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="mobile-brand" aria-label="Ateform">
          <div className="brand-mark">A</div>
        </div>
        <div className="topbar-copy">
          <p className="eyebrow">Good to see you, {firstName}</p>
          <h1>{pageTitles[tab]}</h1>
        </div>
        <div className="topbar-actions">
          <DateNav date={date} setDate={setDate} />
          <div className="profile-chip" title={localMode ? 'Local test mode' : session?.user.email}>
            {firstName.slice(0, 1).toUpperCase()}
          </div>
        </div>
      </header>

      {remoteLoading ? (
        <div className="sync-pill">
          <Loader2 size={14} className="spin" /> Syncing
        </div>
      ) : null}

      <main>
        {tab === 'today' ? (
          <TodayView
            profile={state.profile}
            meals={todaysMeals}
            totals={todaysTotals}
            strength={todaysStrength}
            cardio={todaysCardio}
            steps={todaysSteps}
            latestBody={latestBody}
            onGo={setTab}
          />
        ) : null}
        {tab === 'food' ? (
          <FoodView
            date={date}
            meals={todaysMeals}
            savedMeals={state.savedMeals}
            onAdd={addMeal}
            onDelete={deleteMeal}
            onSaveMeal={saveMeal}
            onLogSavedMeal={logSavedMeal}
            remoteEnabled={Boolean(supabase && session && !localMode)}
          />
        ) : null}
        {tab === 'training' ? (
          <TrainingView
            date={date}
            session={todaysStrength}
            programs={state.programs}
            onSaveStrength={saveStrength}
            onSaveProgram={saveProgram}
          />
        ) : null}
        {tab === 'cardio' ? (
          <CardioView
            date={date}
            cardio={todaysCardio}
            steps={todaysSteps}
            onSaveCardio={saveCardio}
            onSaveSteps={saveSteps}
          />
        ) : null}
        {tab === 'progress' ? (
          <ProgressView
            date={date}
            body={state.body}
            photos={state.photos}
            workouts={state.strength}
            onSaveBody={saveBody}
            onSavePhoto={savePhoto}
          />
        ) : null}
        {tab === 'profile' ? (
          <ProfileView
            profile={state.profile}
            localMode={localMode}
            onSave={upsertProfile}
            onSignOut={async () => {
              if (supabase) await supabase.auth.signOut();
              setLocalMode(!hasSupabaseConfig);
            }}
          />
        ) : null}
      </main>

      <nav className="tabbar">
        <div className="nav-brand" aria-label="Ateform"><div className="brand-mark">A</div><span>Ateform</span></div>
        <TabButton active={tab === 'today'} icon={<Home />} label="Today" onClick={() => setTab('today')} />
        <TabButton active={tab === 'food'} icon={<Utensils />} label="Food" onClick={() => setTab('food')} />
        <TabButton active={tab === 'training'} icon={<Dumbbell />} label="Train" onClick={() => setTab('training')} />
        <TabButton active={tab === 'cardio'} icon={<Activity />} label="Cardio" onClick={() => setTab('cardio')} />
        <TabButton active={tab === 'progress'} icon={<Weight />} label="Progress" onClick={() => setTab('progress')} />
        <TabButton active={tab === 'profile'} icon={<Settings />} label="Profile" onClick={() => setTab('profile')} />
      </nav>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function AuthScreen({ onLocal }: { onLocal: () => void }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  function changeMode(nextMode: 'sign-in' | 'sign-up') {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setFeedback(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFeedback({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }
    if (password.length < 8) {
      setFeedback({ type: 'error', text: 'Your password must contain at least 8 characters.' });
      return;
    }
    if (mode === 'sign-up' && !cleanName) {
      setFeedback({ type: 'error', text: 'Enter your name.' });
      return;
    }
    if (mode === 'sign-up' && password !== confirmPassword) {
      setFeedback({ type: 'error', text: 'The passwords do not match.' });
      return;
    }

    setBusy(true);
    setFeedback(null);
    const result =
      mode === 'sign-up'
        ? await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: { data: { full_name: cleanName } }
          })
        : await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(false);

    if (result.error) {
      setFeedback({ type: 'error', text: result.error.message });
      return;
    }

    if (mode === 'sign-up' && !result.data.session) {
      setFeedback({
        type: 'success',
        text: 'Account created. Check your inbox to confirm your email, then come back and sign in.'
      });
      setPassword('');
      setConfirmPassword('');
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-brand" aria-label="Ateform">
        <div className="brand-mark">A</div>
        <span>Ateform</span>
      </div>
      {hasSupabaseConfig ? (
        <section className="auth-card">
          <div className="auth-heading">
            <p className="eyebrow">YOUR FITNESS, IN FORM</p>
            <h1>{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h1>
            <p>
              {mode === 'sign-in'
                ? 'Sign in to continue tracking your progress.'
                : 'Start tracking your food, training, and body.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={submit} noValidate>
            {mode === 'sign-up' ? (
              <label>
                Name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  disabled={busy}
                />
              </label>
            ) : null}

            <label>
              Email address
              <input
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="you@example.com"
                disabled={busy}
              />
            </label>

            <label>
              Password
              <span className="password-field">
                <input
                  autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            {mode === 'sign-up' ? (
              <label>
                Confirm password
                <input
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  disabled={busy}
                />
              </label>
            ) : null}

            {feedback ? (
              <div className={`auth-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
                {feedback.text}
              </div>
            ) : null}

            <button className="primary auth-submit" disabled={busy} type="submit">
              {busy ? <Loader2 className="spin" size={18} /> : null}
              {busy ? 'Please wait' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="auth-switch">
            <span>{mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}</span>
            <button type="button" className="text-button" disabled={busy} onClick={() => changeMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
              {mode === 'sign-in' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </section>
      ) : (
        <div className="panel auth-card">
          <p className="hint">Supabase keys are not configured yet. You can still test the app locally on this device.</p>
          <button className="primary" onClick={onLocal}>
            Open local test mode
          </button>
        </div>
      )}
    </main>
  );
}

function TodayView({
  profile,
  meals,
  totals,
  strength,
  cardio,
  steps,
  latestBody,
  onGo
}: {
  profile: UserProfile;
  meals: MealEntry[];
  totals: ReturnType<typeof sumNutrients>;
  strength?: StrengthSession;
  cardio: CardioEntry[];
  steps: number;
  latestBody?: BodyMetric;
  onGo: (tab: Tab) => void;
}) {
  const caloriesLeft = profile.calorieTarget - totals.calories;
  const calorieProgress = Math.min(100, Math.max(0, (totals.calories / profile.calorieTarget) * 100));
  return (
    <section className="stack view today-view">
      <div className="hero-panel" style={{ '--calorie-progress': `${calorieProgress}%` } as CSSProperties}>
        <div className="hero-copy">
          <p className="eyebrow">Energy budget</p>
          <h2>Fuel the work.<br />Keep the form.</h2>
          <p className="muted">{totals.calories.toLocaleString()} of {profile.calorieTarget.toLocaleString()} kcal consumed today</p>
          <button className="hero-action" onClick={() => onGo('food')}>
            <Plus size={17} /> Log food
          </button>
        </div>
        <div className={`calorie-dial ${caloriesLeft < 0 ? 'over' : ''}`}>
          <div>
            <strong>{Math.abs(caloriesLeft).toLocaleString()}</strong>
            <span>{caloriesLeft < 0 ? 'kcal over' : 'kcal left'}</span>
          </div>
        </div>
      </div>
      <MacroBars profile={profile} totals={totals} />
      <div className="quick-grid">
        <MetricCard icon={<Apple />} label="Protein" value={`${totals.protein}g`} target={`${profile.proteinTargetG}g`} />
        <MetricCard icon={<Activity />} label="Steps" value={steps.toLocaleString()} target={`${profile.dailyStepsTarget.toLocaleString()}`} />
        <MetricCard icon={<Dumbbell />} label="Strength" value={strength ? strength.templateName : 'None'} target={strength ? `${countSets(strength.exercises)} sets` : 'Log'} />
        <MetricCard icon={<Flame />} label="Cardio" value={`${cardio.reduce((sum, item) => sum + item.durationMin, 0)}m`} target="today" />
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Today</h2>
          <button className="text-button" onClick={() => onGo('food')}>Food</button>
        </div>
        {meals.length ? (
          <div className="list">
            {meals.slice(0, 5).map((entry) => (
              <div className="row" key={entry.id}>
                <div>
                  <strong>{entry.food.name}</strong>
                  <p>{entry.mealType} · {entry.grams}g</p>
                </div>
                <span className="mono">{entry.nutrients.calories} kcal</span>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No food logged yet" text="Search food and add portions from the Food tab." />
        )}
      </div>
      <div className="panel compact-row">
        <div>
          <p className="eyebrow">Latest body</p>
          <h2>{latestBody?.weightKg ? `${latestBody.weightKg} kg` : 'No weight yet'}</h2>
        </div>
        <button className="secondary small" onClick={() => onGo('progress')}>Update</button>
      </div>
    </section>
  );
}

function FoodView({
  date,
  meals,
  savedMeals,
  onAdd,
  onDelete,
  onSaveMeal,
  onLogSavedMeal,
  remoteEnabled
}: {
  date: string;
  meals: MealEntry[];
  savedMeals: SavedMeal[];
  onAdd: (entry: MealEntry) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaveMeal: (meal: SavedMeal) => Promise<void>;
  onLogSavedMeal: (meal: SavedMeal, type: MealType) => Promise<void>;
  remoteEnabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>(seedFoods);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState(100);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [busy, setBusy] = useState(false);
  const [saveMealOpen, setSaveMealOpen] = useState(false);
  const [savedMealName, setSavedMealName] = useState('');
  const [custom, setCustom] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  const totals = sumNutrients(meals);

  async function search() {
    const q = query.trim();
    if (!q) {
      setResults(seedFoods);
      return;
    }
    setBusy(true);
    try {
      if (supabase && remoteEnabled) {
        const { data, error } = await supabase.functions.invoke('food-search', { body: { query: q } });
        if (!error && Array.isArray(data?.foods)) {
          setResults(data.foods);
          return;
        }
      }
      setResults(seedFoods.filter((food) => food.name.toLowerCase().includes(q.toLowerCase())));
    } finally {
      setBusy(false);
    }
  }

  function addCustomFood() {
    if (!custom.name) return;
    const food: Food = {
      id: uid('food'),
      source: 'custom',
      name: custom.name,
      servingUnit: '100 g',
      servingGrams: 100,
      nutrientsPer100g: {
        calories: Number(custom.calories) || 0,
        protein: Number(custom.protein) || 0,
        carbs: Number(custom.carbs) || 0,
        fat: Number(custom.fat) || 0
      }
    };
    setResults([food, ...results]);
    setSelected(food);
    setCustom({ name: '', calories: '', protein: '', carbs: '', fat: '' });
  }

  async function addSelected() {
    if (!selected) return;
    await onAdd({
      id: uid('meal'),
      date,
      mealType,
      food: selected,
      grams,
      nutrients: scaleNutrients(selected.nutrientsPer100g, grams),
      createdAt: new Date().toISOString()
    });
    setSelected(null);
  }

  function saveCurrentMeal() {
    const name = savedMealName.trim();
    if (!name || meals.length === 0) return;
    void onSaveMeal({
      id: uid('saved'),
      name,
      items: meals.map((entry) => ({ food: entry.food, grams: entry.grams }))
    });
    setSavedMealName('');
    setSaveMealOpen(false);
  }

  return (
    <section className="stack view food-view">
      <div className="panel food-intro">
        <div>
          <p className="eyebrow">Food library</p>
          <h2>Eat well, with the full picture.</h2>
          <p className="hint">Search verified food data, then see macros, minerals and vitamins for the portion you actually ate.</p>
        </div>
        <Apple size={30} aria-hidden="true" />
      </div>

      <div className="panel search-panel">
        <div className="search-line">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Search chicken, rice, yogurt..." />
          <button className="secondary small" onClick={search}>{busy ? <Loader2 className="spin" size={15} /> : 'Go'}</button>
        </div>
        <p className="hint">{remoteEnabled ? 'Using USDA + Open Food Facts through Supabase.' : 'Local demo search. Add Supabase keys for live food APIs.'}</p>
      </div>

      <div className="section-title"><div><p className="eyebrow">Discover</p><h2>{query ? 'Search results' : 'Popular foods'}</h2></div><span>{results.length} foods</span></div>
      <div className="food-list">
        {results.map((food) => {
          const { Icon, tint } = foodCategory(food.name);
          return (
            <button className="food-result" key={food.id} onClick={() => { setSelected(food); setGrams(food.servingGrams || 100); }}>
              <span className="food-avatar" style={{ background: tint }}><Icon size={18} aria-hidden="true" /></span>
              <span className="food-result-copy">
                <strong>{food.name}</strong>
                <span>{food.brand || food.source} · 100g</span>
              </span>
              <MacroMini nutrients={food.nutrientsPer100g} />
              <span className="food-add" aria-hidden="true"><Plus size={16} /></span>
            </button>
          );
        })}
      </div>

      <div className="panel">
        <h2>Custom food</h2>
        <div className="grid two">
          <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Name" />
          <input value={custom.calories} onChange={(e) => setCustom({ ...custom, calories: e.target.value })} inputMode="decimal" placeholder="kcal / 100g" />
          <input value={custom.protein} onChange={(e) => setCustom({ ...custom, protein: e.target.value })} inputMode="decimal" placeholder="protein" />
          <input value={custom.carbs} onChange={(e) => setCustom({ ...custom, carbs: e.target.value })} inputMode="decimal" placeholder="carbs" />
          <input value={custom.fat} onChange={(e) => setCustom({ ...custom, fat: e.target.value })} inputMode="decimal" placeholder="fat" />
          <button className="secondary" onClick={addCustomFood}>Add custom</button>
        </div>
      </div>

      {selected ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label={`Log ${selected.name}`}>
          <div className="panel modal-card food-log-modal">
            <div className="panel-head">
              <div><p className="eyebrow">{selected.brand || selected.source}</p><h2>{selected.name}</h2></div>
              <button className="icon-only" onClick={() => setSelected(null)} aria-label="Close"><X size={17} /></button>
            </div>
            <div className="grid two">
              <label>Meal<select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>{mealTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label>Grams<input value={grams} onChange={(e) => setGrams(Number(e.target.value) || 0)} inputMode="decimal" /></label>
            </div>
            <MacroMini nutrients={scaleNutrients(selected.nutrientsPer100g, grams)} />
            <NutrientGrid nutrients={scaleNutrients(selected.nutrientsPer100g, grams)} compact />
            <button className="primary" onClick={addSelected}><Plus size={16} /> Log food</button>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Logged food</h2>
            <p className="hint">{totals.calories} kcal · {totals.protein}g protein</p>
          </div>
          <button className="secondary small" onClick={() => setSaveMealOpen(true)} disabled={!meals.length}>Save meal</button>
        </div>
        {meals.length ? (
          <div className="list">
            {meals.map((entry) => (
              <div className="row" key={entry.id}>
                <div>
                  <strong>{entry.food.name}</strong>
                  <p>{entry.mealType} · {entry.grams}g · {entry.nutrients.protein}p/{entry.nutrients.carbs}c/{entry.nutrients.fat}f</p>
                </div>
                <button className="icon-only danger" onClick={() => onDelete(entry.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        ) : <Empty title="Nothing yet" text="Search a food above and log the portion you ate." />}
      </div>

      {meals.length ? <NutrientGrid nutrients={totals} /> : null}

      <div className="panel">
        <h2>Saved meals</h2>
        {savedMeals.length ? savedMeals.map((meal) => (
          <div className="row" key={meal.id}>
            <div>
              <strong>{meal.name}</strong>
              <p>{meal.items.length} items</p>
            </div>
            <button className="secondary small" onClick={() => onLogSavedMeal(meal, mealType)}>Log</button>
          </div>
        )) : <Empty title="No saved meals" text="Save common meals from today's log." />}
      </div>

      {saveMealOpen ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Save this meal">
          <div className="panel modal-card">
            <div className="panel-head"><div><p className="eyebrow">Reusable meal</p><h2>Save this meal</h2></div><button className="icon-only" onClick={() => setSaveMealOpen(false)} aria-label="Close"><X size={17} /></button></div>
            <p className="hint">This saves {meals.length} logged item{meals.length === 1 ? '' : 's'} with their portions.</p>
            <label className="modal-field">Meal name<input value={savedMealName} onChange={(e) => setSavedMealName(e.target.value)} autoFocus placeholder="e.g. My usual breakfast" /></label>
            <button className="primary" onClick={saveCurrentMeal} disabled={!savedMealName.trim()}>Save meal</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TrainingView({
  date,
  session,
  programs,
  onSaveStrength,
  onSaveProgram
}: {
  date: string;
  session?: StrengthSession;
  programs: TrainingProgram[];
  onSaveStrength: (session: StrengthSession) => Promise<void>;
  onSaveProgram: (program: TrainingProgram) => Promise<void>;
}) {
  const [template, setTemplate] = useState(session?.templateName || 'Push');
  const [exercises, setExercises] = useState<StrengthExercise[]>(session?.exercises || templateSeeds.Push.map((name) => ({ name, sets: [{ weightKg: 0, reps: 0 }] })));
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [exerciseName, setExerciseName] = useState('');
  const [programModalOpen, setProgramModalOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState(programs[0]?.id || '');
  const [programDraft, setProgramDraft] = useState<TrainingProgram>({ id: uid('program'), name: 'My program', days: [] });
  const [editingDayId, setEditingDayId] = useState('');
  const [programExercise, setProgramExercise] = useState('');

  const selectedProgram = programs.find((program) => program.id === selectedProgramId) || programs[0];
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const mondayFirstDay = weekday === 0 ? 6 : weekday - 1;
  const editingDay = programDraft.days.find((day) => day.id === editingDayId) || programDraft.days[0];

  useEffect(() => {
    if (session) {
      setTemplate(session.templateName);
      setExercises(session.exercises);
    }
  }, [session]);

  useEffect(() => {
    if (programs.length && !programs.some((program) => program.id === selectedProgramId)) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  function switchTemplate(name: string) {
    setTemplate(name);
    setExercises(templateSeeds[name].map((exercise) => ({ name: exercise, sets: [{ weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }] })));
  }

  function updateSet(exerciseIndex: number, setIndex: number, field: 'weightKg' | 'reps', value: number) {
    setExercises((current) => current.map((exercise, i) => i !== exerciseIndex ? exercise : {
      ...exercise,
      sets: exercise.sets.map((set, j) => j !== setIndex ? set : { ...set, [field]: value })
    }));
  }

  function addExercise() {
    const name = exerciseName.trim();
    if (!name) return;
    setExercises([...exercises, { name, sets: [{ weightKg: 0, reps: 0 }] }]);
    setExerciseName('');
    setExerciseModalOpen(false);
  }

  function beginProgram(program?: TrainingProgram) {
    const draft = program
      ? { ...program, days: program.days.map((day) => ({ ...day, exercises: [...day.exercises] })) }
      : { id: uid('program'), name: 'My program', days: [] };
    setProgramDraft(draft);
    setEditingDayId(draft.days[0]?.id || '');
    setProgramExercise('');
    setProgramModalOpen(true);
  }

  function addProgramDay(weekdayIndex: number) {
    const existing = programDraft.days.find((day) => day.weekday === weekdayIndex);
    if (existing) {
      setEditingDayId(existing.id);
      return;
    }
    const day: ProgramDay = { id: uid('program-day'), weekday: weekdayIndex, name: 'Workout', exercises: [] };
    setProgramDraft({ ...programDraft, days: [...programDraft.days, day].sort((a, b) => a.weekday - b.weekday) });
    setEditingDayId(day.id);
  }

  function updateProgramDay(dayId: string, update: Partial<ProgramDay>) {
    setProgramDraft({ ...programDraft, days: programDraft.days.map((day) => day.id === dayId ? { ...day, ...update } : day) });
  }

  function addProgramExercise() {
    if (!editingDay || !programExercise.trim()) return;
    updateProgramDay(editingDay.id, { exercises: [...editingDay.exercises, programExercise.trim()] });
    setProgramExercise('');
  }

  function useTemplateInProgram(templateName: string) {
    if (!editingDay) return;
    updateProgramDay(editingDay.id, { name: templateName, exercises: [...templateSeeds[templateName]] });
  }

  function saveProgramDraft() {
    const cleanName = programDraft.name.trim();
    const cleanDays = programDraft.days
      .map((day) => ({ ...day, name: day.name.trim() || 'Workout', exercises: day.exercises.filter(Boolean) }))
      .filter((day) => day.exercises.length > 0);
    if (!cleanName || !cleanDays.length) return;
    void onSaveProgram({ ...programDraft, name: cleanName, days: cleanDays });
    setSelectedProgramId(programDraft.id);
    setProgramModalOpen(false);
  }

  function startProgramDay(day: ProgramDay) {
    setTemplate(day.name);
    setExercises(day.exercises.map((name) => ({ name, sets: [{ weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0 }] })));
  }

  return (
    <section className="stack view training-view">
      <div className="panel program-overview">
        <div className="panel-head">
          <div><p className="eyebrow">Weekly structure</p><h2>{selectedProgram?.name || 'Your training program'}</h2></div>
          <button className="secondary small" onClick={() => beginProgram(selectedProgram)}>{selectedProgram ? 'Edit program' : <><Plus size={14} /> Create</>}</button>
        </div>
        {programs.length > 1 ? <select className="program-select" value={selectedProgram?.id || ''} onChange={(event) => setSelectedProgramId(event.target.value)}>{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select> : null}
        {selectedProgram ? (
          <div className="program-days">{weekDays.map((day, index) => {
            const programDay = selectedProgram.days.find((item) => item.weekday === index);
            return <div className={`program-day ${index === mondayFirstDay ? 'today' : ''} ${programDay ? 'planned' : ''}`} key={day.label}><span>{day.label}</span>{programDay ? <><strong>{programDay.name}</strong><small>{programDay.exercises.length} exercises</small><button onClick={() => startProgramDay(programDay)}>Load</button></> : <small>Rest</small>}</div>;
          })}</div>
        ) : <Empty title="Build your weekly plan" text="Create a program with any split: PPL, upper/lower, full body, or your own approach." />}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div><p className="eyebrow">Today’s session</p><h2>{template}</h2></div>
          <button className="secondary small" onClick={() => setExerciseModalOpen(true)}><Plus size={14} /> Exercise</button>
        </div>
        <div className="segmented">
          {Object.keys(templateSeeds).map((name) => <button key={name} className={template === name ? 'active' : ''} onClick={() => switchTemplate(name)}>{name}</button>)}
        </div>
        <div className="exercise-list">
          {exercises.map((exercise, exerciseIndex) => (
            <div className="exercise-card" key={`${exercise.name}-${exerciseIndex}`}>
              <input className="exercise-name" value={exercise.name} onChange={(e) => setExercises(exercises.map((item, i) => i === exerciseIndex ? { ...item, name: e.target.value } : item))} />
              {exercise.sets.map((set, setIndex) => (
                <div className="set-line" key={setIndex}>
                  <span>{setIndex + 1}</span>
                  <input inputMode="decimal" value={set.weightKg || ''} onChange={(e) => updateSet(exerciseIndex, setIndex, 'weightKg', Number(e.target.value) || 0)} placeholder="kg" />
                  <input inputMode="numeric" value={set.reps || ''} onChange={(e) => updateSet(exerciseIndex, setIndex, 'reps', Number(e.target.value) || 0)} placeholder="reps" />
                  <button className="icon-only" onClick={() => setExercises(exercises.map((item, i) => i === exerciseIndex ? { ...item, sets: item.sets.filter((_, j) => j !== setIndex) } : item))}>x</button>
                </div>
              ))}
              <button className="text-button" onClick={() => setExercises(exercises.map((item, i) => i === exerciseIndex ? { ...item, sets: [...item.sets, { weightKg: 0, reps: 0 }] } : item))}>Add set</button>
            </div>
          ))}
        </div>
        <button className="primary" onClick={() => onSaveStrength({ id: session?.id || uid('strength'), date, templateName: template, exercises })}>
          <Save size={16} /> Save session
        </button>
      </div>

      {exerciseModalOpen ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Add exercise">
          <div className="panel modal-card">
            <div className="panel-head"><div><p className="eyebrow">Strength library</p><h2>Add an exercise</h2></div><button className="icon-only" onClick={() => setExerciseModalOpen(false)} aria-label="Close"><X size={17} /></button></div>
            <p className="hint">Add any movement to this training session.</p>
            <label className="modal-field">Exercise name<input value={exerciseName} onChange={(e) => setExerciseName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && addExercise()} placeholder="e.g. Cable fly" /></label>
            <button className="primary" onClick={addExercise} disabled={!exerciseName.trim()}><Plus size={16} /> Add exercise</button>
          </div>
        </div>
      ) : null}

      {programModalOpen ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Build training program">
          <div className="panel modal-card program-builder">
            <div className="panel-head"><div><p className="eyebrow">Weekly program</p><h2>Build your plan</h2></div><button className="icon-only" onClick={() => setProgramModalOpen(false)} aria-label="Close"><X size={17} /></button></div>
            <label className="modal-field">Program name<input value={programDraft.name} onChange={(event) => setProgramDraft({ ...programDraft, name: event.target.value })} placeholder="e.g. Five day PPL" /></label>
            <div className="builder-week"><p className="eyebrow">Pick your training days</p><div>{weekDays.map((day, index) => { const planned = programDraft.days.find((item) => item.weekday === index); return <button key={day.label} className={planned?.id === editingDay?.id ? 'active' : planned ? 'planned' : ''} onClick={() => addProgramDay(index)}><span>{day.label}</span><small>{planned ? planned.name : '+'}</small></button>; })}</div></div>
            {editingDay ? <div className="builder-day">
              <div className="builder-day-head"><p className="eyebrow">{weekDays[editingDay.weekday].full}</p><button className="text-button" onClick={() => { setProgramDraft({ ...programDraft, days: programDraft.days.filter((day) => day.id !== editingDay.id) }); setEditingDayId(''); }}>Remove day</button></div>
              <label>Session name<input value={editingDay.name} onChange={(event) => updateProgramDay(editingDay.id, { name: event.target.value })} placeholder="Push, pull, legs..." /></label>
              <div className="template-pills">{Object.keys(templateSeeds).map((name) => <button key={name} onClick={() => useTemplateInProgram(name)}>Use {name}</button>)}</div>
              <div className="program-exercise-list">{editingDay.exercises.length ? editingDay.exercises.map((name, index) => <div key={`${name}-${index}`}><span>{index + 1}</span><input value={name} onChange={(event) => updateProgramDay(editingDay.id, { exercises: editingDay.exercises.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /><button className="icon-only" onClick={() => updateProgramDay(editingDay.id, { exercises: editingDay.exercises.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove ${name}`}><X size={15} /></button></div>) : <p className="hint">Choose a template above or add your own movements.</p>}</div>
              <div className="add-program-exercise"><input value={programExercise} onChange={(event) => setProgramExercise(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addProgramExercise()} placeholder="Add an exercise" /><button className="secondary small" onClick={addProgramExercise} disabled={!programExercise.trim()}><Plus size={14} /> Add</button></div>
            </div> : <div className="builder-empty"><strong>Choose a day above to start building it.</strong><p>Tap a weekday to add a training day. Leave the rest as recovery days.</p></div>}
            <button className="primary" onClick={saveProgramDraft} disabled={!programDraft.name.trim() || !programDraft.days.some((day) => day.exercises.length)}><Save size={16} /> Save program</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CardioView({ date, cardio, steps, onSaveCardio, onSaveSteps }: {
  date: string;
  cardio: CardioEntry[];
  steps: number;
  onSaveCardio: (entry: CardioEntry) => Promise<void>;
  onSaveSteps: (steps: number) => Promise<void>;
}) {
  const [cardioForm, setCardioForm] = useState({ type: 'Walk', duration: '', distance: '', calories: '' });
  const [stepInput, setStepInput] = useState(String(steps || ''));
  const totalMinutes = cardio.reduce((total, entry) => total + entry.durationMin, 0);

  useEffect(() => setStepInput(String(steps || '')), [steps, date]);

  function saveCardioEntry() {
    if (!cardioForm.type.trim() || !Number(cardioForm.duration)) return;
    void onSaveCardio({ id: uid('cardio'), date, type: cardioForm.type.trim(), durationMin: Number(cardioForm.duration), distanceKm: Number(cardioForm.distance) || undefined, calories: Number(cardioForm.calories) || undefined });
    setCardioForm({ type: 'Walk', duration: '', distance: '', calories: '' });
  }

  return <section className="stack view cardio-view">
    <div className="cardio-hero">
      <div><p className="eyebrow">Move outside the gym</p><h2>Build your engine.</h2><p>Log the work that keeps your heart, recovery and daily energy moving.</p></div>
      <Activity size={40} strokeWidth={1.7} />
    </div>
    <div className="panel cardio-log-panel">
      <div className="panel-head"><div><p className="eyebrow">Today</p><h2>Log cardio</h2></div><span className="cardio-total">{totalMinutes} min</span></div>
      <div className="grid two">
        <label>Activity<input value={cardioForm.type} onChange={(e) => setCardioForm({ ...cardioForm, type: e.target.value })} placeholder="Walk, run, bike" /></label>
        <label>Duration<input value={cardioForm.duration} onChange={(e) => setCardioForm({ ...cardioForm, duration: e.target.value })} inputMode="numeric" placeholder="minutes" /></label>
        <label>Distance <span className="label-optional">optional</span><input value={cardioForm.distance} onChange={(e) => setCardioForm({ ...cardioForm, distance: e.target.value })} inputMode="decimal" placeholder="km" /></label>
        <label>Calories <span className="label-optional">optional</span><input value={cardioForm.calories} onChange={(e) => setCardioForm({ ...cardioForm, calories: e.target.value })} inputMode="numeric" placeholder="kcal" /></label>
      </div>
      <button className="primary" onClick={saveCardioEntry} disabled={!cardioForm.type.trim() || !Number(cardioForm.duration)}><Bike size={16} /> Add cardio</button>
    </div>
    <div className="panel steps-panel">
      <div><p className="eyebrow">Daily movement</p><h2><Footprints size={20} /> Steps</h2><p className="hint">Your walking counts too. Keep the streak visible.</p></div>
      <div className="steps-control"><input className="big-input" value={stepInput} onChange={(e) => setStepInput(e.target.value)} inputMode="numeric" placeholder="7000" /><button className="secondary small" onClick={() => onSaveSteps(Number(stepInput) || 0)}>Save</button></div>
    </div>
    <div className="panel cardio-history"><div className="panel-head"><div><p className="eyebrow">Session history</p><h2>Today’s activity</h2></div><span>{cardio.length} session{cardio.length === 1 ? '' : 's'}</span></div>{cardio.length ? cardio.map((entry) => <div className="row cardio-row" key={entry.id}><div><strong>{entry.type}</strong><p>{entry.durationMin} minutes{entry.distanceKm ? ` · ${entry.distanceKm} km` : ''}</p></div><span>{entry.calories ? `${entry.calories} kcal` : 'Logged'}</span></div>) : <Empty title="No cardio yet" text="Walking, runs, bike rides and anything that raises your heart rate belongs here." />}</div>
  </section>;
}

function ProgressView({
  date,
  body,
  photos,
  workouts,
  onSaveBody,
  onSavePhoto
}: {
  date: string;
  body: BodyMetric[];
  photos: ProgressPhoto[];
  workouts: StrengthSession[];
  onSaveBody: (entry: BodyMetric) => Promise<void>;
  onSavePhoto: (file: File, label: string) => Promise<void>;
}) {
  const existing = body.find((item) => item.date === date);
  const [metric, setMetric] = useState({ weight: existing?.weightKg ? String(existing.weightKg) : '', waist: existing?.waistCm ? String(existing.waistCm) : '', bodyFat: existing?.bodyFatPercent ? String(existing.bodyFatPercent) : '' });
  const sortedBody = [...body].filter((item) => item.weightKg).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  return (
    <section className="stack view progress-view">
      <div className="panel">
        <h2>Weight trend</h2>
        <Trend points={sortedBody.map((item) => ({ date: item.date, value: item.weightKg || 0 }))} />
      </div>
      <div className="panel">
        <h2>Body check-in</h2>
        <div className="grid three">
          <input value={metric.weight} onChange={(e) => setMetric({ ...metric, weight: e.target.value })} inputMode="decimal" placeholder="kg" />
          <input value={metric.waist} onChange={(e) => setMetric({ ...metric, waist: e.target.value })} inputMode="decimal" placeholder="waist cm" />
          <input value={metric.bodyFat} onChange={(e) => setMetric({ ...metric, bodyFat: e.target.value })} inputMode="decimal" placeholder="body fat %" />
        </div>
        <button className="secondary" onClick={() => onSaveBody({ id: existing?.id || uid('body'), date, weightKg: Number(metric.weight) || undefined, waistCm: Number(metric.waist) || undefined, bodyFatPercent: Number(metric.bodyFat) || undefined })}>Save body</button>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Progress photos</h2>
          <label className="upload-button"><Camera size={16} /> Add<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onSavePhoto(e.target.files[0], 'Progress')} /></label>
        </div>
        {photos.length ? <div className="photo-grid">{photos.map((photo) => <img key={photo.id} src={photo.url} alt={photo.label} />)}</div> : <Empty title="No photos yet" text="Add front/side/back photos as you test your progress." />}
      </div>
      <div className="panel">
        <h2>Strength history</h2>
        {workouts.length ? workouts.slice(0, 8).map((workout) => <div className="row" key={workout.id}><strong>{prettyDate(workout.date)} · {workout.templateName}</strong><span>{countSets(workout.exercises)} sets</span></div>) : <Empty title="No workouts yet" text="Saved strength sessions will show here." />}
      </div>
    </section>
  );
}

function ProfileView({ profile, localMode, onSave, onSignOut }: { profile: UserProfile; localMode: boolean; onSave: (profile: UserProfile) => Promise<void>; onSignOut: () => Promise<void> }) {
  const [draft, setDraft] = useState(profile);
  const calculated = calculateTargets(draft);

  function save() {
    void onSave({ ...draft, ...calculated });
  }

  return (
    <section className="stack view profile-view">
      <div className="panel">
        <h2>Profile and goal</h2>
        <div className="grid two">
          <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label>Age<input value={draft.age} onChange={(e) => setDraft({ ...draft, age: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
          <label>Height cm<input value={draft.heightCm} onChange={(e) => setDraft({ ...draft, heightCm: Number(e.target.value) || 0 })} inputMode="decimal" /></label>
          <label>Weight kg<input value={draft.currentWeightKg} onChange={(e) => setDraft({ ...draft, currentWeightKg: Number(e.target.value) || 0 })} inputMode="decimal" /></label>
          <label>Goal<select value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value as UserProfile['goal'] })}><option value="fat_loss">Fat loss</option><option value="recomp">Lose fat + build muscle</option><option value="muscle_gain">Muscle gain</option><option value="maintain">Maintain</option></select></label>
          <label>Activity<select value={draft.activityLevel} onChange={(e) => setDraft({ ...draft, activityLevel: e.target.value as UserProfile['activityLevel'] })}><option value="light">Light</option><option value="moderate">Moderate</option><option value="active">Active</option><option value="very_active">Very active</option></select></label>
          <label>Training days<input value={draft.trainingDaysPerWeek} onChange={(e) => setDraft({ ...draft, trainingDaysPerWeek: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
          <label>Step target<input value={draft.dailyStepsTarget} onChange={(e) => setDraft({ ...draft, dailyStepsTarget: Number(e.target.value) || 0 })} inputMode="numeric" /></label>
        </div>
      </div>
      <div className="panel target-card">
        <p className="eyebrow">Calculated target</p>
        <h2>{calculated.calorieTarget} kcal</h2>
        <MacroMini nutrients={{ calories: calculated.calorieTarget, protein: calculated.proteinTargetG, carbs: calculated.carbTargetG, fat: calculated.fatTargetG }} />
        <p className="hint">BMR {calculated.bmr} · estimated maintenance {calculated.tdee}</p>
        <button className="primary" onClick={save}><Save size={16} /> Save targets</button>
      </div>
      <div className="panel">
        <button className="secondary" onClick={onSignOut}><LogOut size={16} /> {localMode ? 'Leave local mode' : 'Sign out'}</button>
      </div>
    </section>
  );
}

function DateNav({ date, setDate }: { date: string; setDate: (date: string) => void }) {
  function move(days: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDate(todayKey(d));
  }
  return <div className="date-nav"><button onClick={() => move(-1)} aria-label="Previous day"><ChevronLeft size={16} /></button><span>{date === todayKey() ? 'Today' : prettyDate(date)}</span><button onClick={() => move(1)} aria-label="Next day"><ChevronRight size={16} /></button></div>;
}

function MacroBars({ profile, totals }: { profile: UserProfile; totals: ReturnType<typeof sumNutrients> }) {
  return (
    <div className="panel macro-panel">
      <div className="panel-head macro-head"><div><p className="eyebrow">Daily intake</p><h2>Macros</h2></div><span>{totals.calories} kcal</span></div>
      <Bar label="Calories" value={totals.calories} target={profile.calorieTarget} unit="" />
      <Bar label="Protein" value={totals.protein} target={profile.proteinTargetG} unit="g" />
      <Bar label="Carbs" value={totals.carbs} target={profile.carbTargetG} unit="g" />
      <Bar label="Fat" value={totals.fat} target={profile.fatTargetG} unit="g" />
    </div>
  );
}

function Bar({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = Math.min(100, (value / target) * 100);
  return <div className="bar-row"><div><span>{label}</span><span className="mono">{value}{unit} / {target}{unit}</span></div><div className="bar"><i style={{ width: `${pct}%` }} /></div></div>;
}

function MetricCard({ icon, label, value, target }: { icon: React.ReactNode; label: string; value: string; target: string }) {
  return <div className={`metric-card metric-${label.toLowerCase()}`}><div className="metric-icon">{icon}</div><p>{label}</p><strong>{value}</strong><span>{target}</span></div>;
}

function MacroMini({ nutrients }: { nutrients: { calories: number; protein: number; carbs: number; fat: number } }) {
  return <div className="macro-mini"><span>{nutrients.calories} kcal</span><span>{nutrients.protein}p</span><span>{nutrients.carbs}c</span><span>{nutrients.fat}f</span></div>;
}

function NutrientGrid({ nutrients, compact = false }: { nutrients: Food['nutrientsPer100g']; compact?: boolean }) {
  const rows = [
    { label: 'Fibre', value: nutrients.fiber, unit: 'g', target: 30 },
    { label: 'Sodium', value: nutrients.sodiumMg, unit: 'mg', target: 2300 },
    { label: 'Potassium', value: nutrients.potassiumMg, unit: 'mg', target: 3400 },
    { label: 'Calcium', value: nutrients.calciumMg, unit: 'mg', target: 1000 },
    { label: 'Iron', value: nutrients.ironMg, unit: 'mg', target: 8 },
    { label: 'Magnesium', value: nutrients.magnesiumMg, unit: 'mg', target: 420 },
    { label: 'Zinc', value: nutrients.zincMg, unit: 'mg', target: 11 },
    { label: 'Vitamin C', value: nutrients.vitaminCMg, unit: 'mg', target: 90 },
    { label: 'Vitamin D', value: nutrients.vitaminDUg, unit: 'µg', target: 15 },
    { label: 'B12', value: nutrients.vitaminB12Ug, unit: 'µg', target: 2.4 }
  ].filter((row) => row.value !== undefined && row.value !== null && Number(row.value) > 0);

  if (!rows.length) return null;
  const visibleRows = compact ? rows.slice(0, 4) : rows;
  return <div className={`nutrient-panel ${compact ? 'compact' : ''}`}>
    {!compact ? <div className="panel-head"><div><p className="eyebrow">Beyond macros</p><h2>Micronutrients</h2></div><span className="nutrient-note">Daily guide</span></div> : <p className="eyebrow">Also in this portion</p>}
    <div className="nutrient-grid">{visibleRows.map((row) => {
      const value = Number(row.value);
      const progress = Math.min(100, (value / row.target) * 100);
      return <div className="nutrient-card" key={row.label}><div><span>{row.label}</span><strong>{value}{row.unit}</strong></div><i><b style={{ width: `${progress}%` }} /></i><small>{Math.round(progress)}% guide</small></div>;
    })}</div>
    {!compact && rows.length < 10 ? <p className="nutrient-disclaimer">Shown when the food source provides the nutrient. Daily guides are general adult male reference values—not medical advice.</p> : null}
  </div>;
}

function Trend({ points }: { points: Array<{ date: string; value: number }> }) {
  if (points.length < 2) return <Empty title="Not enough data" text="Log weight on multiple days to draw a trend." />;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const span = Math.max(1, max - min);
  return <div className="trend">{points.map((point) => <div key={point.date} style={{ height: `${18 + ((point.value - min) / span) * 82}%` }}><span>{point.value}</span></div>)}</div>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><strong>{title}</strong><p>{text}</p></div>;
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactElement; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function countSets(exercises: StrengthExercise[]) {
  return exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.weightKg && set.reps).length, 0);
}

function foodCategory(name: string) {
  const text = name.toLowerCase();
  if (/beef|steak|burger|meatball|pork|bacon|ham\b/.test(text)) return { Icon: Beef, tint: '#8a3a2c' };
  if (/chicken|turkey|poultry|drumstick/.test(text)) return { Icon: Drumstick, tint: '#8a5a1f' };
  if (/egg/.test(text)) return { Icon: Egg, tint: '#8a7a1f' };
  if (/fish|salmon|tuna|shrimp|seafood/.test(text)) return { Icon: Fish, tint: '#1f6a8a' };
  if (/milk|yogurt|yoghurt|cheese|dairy/.test(text)) return { Icon: Milk, tint: '#5a5a5a' };
  if (/rice|bread|khobz|wheat|pasta|oat|grain/.test(text)) return { Icon: Wheat, tint: '#7a6320' };
  if (/apple|fruit|berry|banana|orange/.test(text)) return { Icon: Apple, tint: '#2f7a3d' };
  if (/carrot|vegetable|broccoli|spinach|pepper|onion/.test(text)) return { Icon: Carrot, tint: '#a05a1f' };
  return { Icon: Utensils, tint: '#5a5a5a' };
}

function mealToRow(entry: MealEntry, userId: string) {
  return {
    id: entry.id,
    user_id: userId,
    log_date: entry.date,
    meal_type: entry.mealType,
    food_snapshot: entry.food,
    grams: entry.grams,
    nutrients: entry.nutrients,
    created_at: entry.createdAt
  };
}

function mealFromRow(row: any): MealEntry {
  return {
    id: row.id,
    date: row.log_date,
    mealType: row.meal_type,
    food: row.food_snapshot,
    grams: row.grams,
    nutrients: row.nutrients,
    createdAt: row.created_at
  };
}

function profileToRow(profile: UserProfile) {
  return {
    id: profile.id,
    display_name: profile.name,
    age: profile.age,
    gender: profile.gender,
    height_cm: profile.heightCm,
    current_weight_kg: profile.currentWeightKg,
    activity_level: profile.activityLevel,
    training_days_per_week: profile.trainingDaysPerWeek,
    daily_steps_target: profile.dailyStepsTarget,
    goal: profile.goal,
    calorie_target: profile.calorieTarget,
    protein_target_g: profile.proteinTargetG,
    fat_target_g: profile.fatTargetG,
    carb_target_g: profile.carbTargetG
  };
}

function profileFromRow(row: any): UserProfile {
  return {
    id: row.id,
    name: row.display_name || 'You',
    age: row.age || 21,
    gender: row.gender || 'male',
    heightCm: row.height_cm || 182,
    currentWeightKg: row.current_weight_kg || 80,
    activityLevel: row.activity_level || 'active',
    trainingDaysPerWeek: row.training_days_per_week || 5,
    dailyStepsTarget: row.daily_steps_target || 7000,
    goal: row.goal || 'recomp',
    calorieTarget: row.calorie_target || 2450,
    proteinTargetG: row.protein_target_g || 170,
    fatTargetG: row.fat_target_g || 70,
    carbTargetG: row.carb_target_g || 285
  };
}
