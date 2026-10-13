// Localization: every user-facing string, number, date and duration goes through here.
// Add a language by adding a dictionary with the same keys and a formatter entry.
import type { Category, Language, Period } from '../domain/model';
import { weekday as weekdayOf, type DayKey } from '../domain/time';

export type Locale = 'ar' | 'en';

const ar = {
  appName: 'يومي',
  today: 'النهارده', tomorrow: 'بكرة', yesterday: 'امبارح',
  tabToday: 'اليوم', tabRoutines: 'روتيني', tabHistory: 'سجلّي',
  settings: 'الإعدادات',
  summary: '{done} من {total} خلصت، فاضل حوالي {left}',
  summaryEmpty: 'يوم فاضي. ضيفي أول حاجة من ＋',
  summaryAllDone: 'خلصتي كل حاجة النهارده ✓',
  periodmorning: 'الصبح', periodafternoon: 'بعد الضهر', periodevening: 'بالليل',
  overdue: 'من الأيام اللي فاتت', moveAllToday: 'هاتيهم النهارده',
  done: 'خلصت', doneCount: 'خلصت ({n})',
  catHome: 'البيت', catFood: 'الأكل', catKids: 'الأولاد', catSelf: 'وقت لنفسي', catOther: 'حاجة تانية',
  effort: 'وقت المجهود', wait: 'وقت الانتظار', waitHint: 'زي دورة الغسالة أو الفرن: بتشتغل لوحدها وانتي بتعملي حاجة تانية.',
  noWait: 'من غير', when: 'إمتى', day: 'اليوم', timeOfDay: 'وقت اليوم', important: 'مهمة', notes: 'ملاحظات', notesPh: 'أي تفاصيل…',
  titlePh: 'إيه اللي وراكي؟', add: 'إضافة', save: 'حفظ', cancel: 'إلغاء', delete: 'حذف', details: 'تفاصيل', close: 'إغلاق',
  startTimer: 'ابدئي', stopTimer: 'إيقاف', startWait: 'شغّلي العدّاد', cancelWait: 'إلغاء العدّاد',
  moveTomorrow: 'لبكرة', moveTo: 'نقل ليوم تاني', otherDay: 'يوم تاني',
  swipeStart: 'ابدئي', swipeTomorrow: 'بكرة',
  running: 'شغالة دلوقتي', waitLeft: 'فاضل {t}', waitDone: 'الانتظار خلص', waitDoneOf: '{title}: الانتظار خلص',
  ok: 'تمام',
  undo: 'تراجع', deleted: 'اتشالت', addedOne: 'اتضافت', addedMany: 'اتضاف {n} حاجات', movedTomorrow: 'اتنقلت لبكرة', saved: 'اتحفظ',
  doneToast: 'برافو ✓', doneWaitToast: 'برافو ✓ بدأنا نعدّ {t} انتظار',
  voiceListening: 'بسمعك… قولي كل اللي وراكي', voiceTap: 'دوسي على المايك واتكلمي، أو اكتبي',
  voiceTypeOnly: 'اكتبي اللي وراكي، أو استخدمي مايك الكيبورد',
  voiceExample: 'مثلًا: أشغل الغسالة وأطبخ الغدا بعد الضهر، وبكرة الصبح أنضف الحمام نص ساعة',
  voiceFound: 'لقينا {n}', voiceFoundOne: 'لقينا حاجة واحدة', voiceNothing: 'ما لقيناش حاجات في الكلام ده. جربي تاني.',
  voiceGuess: 'اقتراح', voiceReview: 'راجعي ودوسي على أي اختيار يتغيّر',
  voiceMore: 'زوّدي', voiceAddAll: 'ضيفي {n}', voiceStop: 'خلصت كلام', voiceSpeak: 'اتكلمي',
  voiceMicBlocked: 'المايك مقفول. فعّليه من الإعدادات، أو اكتبي.', voiceNoSpeech: 'ما سمعناش كلام. جربي تاني.',
  voicePermission: 'محتاجين إذن المايك والتعرّف على الكلام. فعّليه من الإعدادات، أو اكتبي.', voiceUnsupported: 'الجهاز ده مش بيدعم الكلام. اكتبي بدل الكلام.',
  voiceFailed: 'ما قدرناش نسمعك. جربي تاني أو اكتبي.',
  priorityOn: '★ مهمة', priorityOff: '☆ عادية',
  plan: 'ترتيب مقترح', planHint: 'ترتيب مقترح بس، غيّري براحتك. بين كل حاجة والتانية ١٠ دقايق راحة.',
  planOver: 'فوق الوقت المتاح', planEmpty: 'مفيش حاجات مستنية. يوم هادي ☼', planFits: '{used} من {cap} متاحة. فاضل لك وقت ليكي.',
  planFull: '{used} من {cap} متاحة. اليوم مليان، ممكن تأجلي حاجة لبكرة من غير ذنب.', readyAt: 'جاهزة حوالي {t}',
  emptyTitle: 'نبدأ بحاجة بسيطة؟', emptyBody: 'دوسي ＋ وقولي اللي وراكي، أو اختاري حاجة من دول.',
  routinesTitle: 'روتيني', routinesEmpty: 'الحاجات اللي بتتكرر، زي الغسيل يومين في الأسبوع. يومي يضيفها ليومها لوحده.',
  newRoutine: 'روتين جديد', editRoutine: 'تعديل الروتين', repeatDays: 'بتتكرر يوم', paused: 'متوقف', pause: 'إيقاف', resume: 'تشغيل',
  routineNote: 'التعديل بيغيّر الأيام الجاية بس. إيقاف التكرار مش بيمسح حاجة.', fromRoutine: 'من روتينك', addNow: 'أضيفيها دلوقتي',
  nextWeek: 'الأسبوع الجاي',
  historyTitle: 'سجلّي', historyHint: 'الوقت للمساعدة في التخطيط، مش لتقييم يومك.',
  statDone: 'خلصت', statMinutes: 'دقيقة مجهود', statLeft: 'لسه', adjust: 'ضبط الوقت', expected: 'المتوقع {a}', tracked: 'المسجل {a}',
  adjustLabel: 'الوقت الفعلي في اليوم ده (دقيقة)', historyEmpty: 'مفيش حاجات في اليوم ده.',
  setLanguage: 'اللغة', langAuto: 'لغة الموبايل', setName: 'الاسم', setCapacity: 'وقت المجهود المتاح يوميًا', setStart: 'بداية ترتيب اليوم',
  setZone: 'المنطقة الزمنية', setData: 'بياناتك', backup: 'نسخة احتياطية', restore: 'استرجاع من ملف',
  dataLocal: 'كل حاجة متخزنة على الموبايل ده بس.', persistBest: 'الموبايل ممكن يمسح البيانات لو المساحة قلت. اعملي نسخة احتياطية من وقت للتاني.',
  restoreConfirm: 'الملف فيه {t} مهمة و{r} روتين. الاسترجاع هيستبدل البيانات الحالية.', replace: 'استبدال', restored: 'اترجعت بياناتك',
  backupSaved: 'اتحفظت نسخة. خليها في مكان آمن.', notifications: 'التنبيهات', notifOn: 'هننبهك لما الانتظار يخلص، حتى لو التطبيق مقفول.',
  notifOff: 'التنبيهات مقفولة. فعّليها من إعدادات الموبايل.', notifWeb: 'التنبيه بيظهر طول ما يومي مفتوح.',
  general: 'عام', aboutDay: 'يومك', light: 'خفيف', normal: 'عادي', heavy: 'تقيل',
  welcome: 'أهلًا بيكي في يومي', welcomeBody: 'يومك على مهلك: قولي اللي وراكي، ويومي يرتّبه.', nameOptional: 'نقولك إيه؟ (اختياري)',
  dayKind: 'يومك عادة عامل إزاي؟', start: 'يلا نبدأ',
  greeting: 'يومك يا {name}',
  update: 'فيه نسخة أحدث.', updateNow: 'حدّثي',
  invalidFile: 'الملف ده مش نسخة من يومي.',
  // domain error codes
  titleRequired: 'اكتبي اسم الحاجة', titleTooLong: 'الاسم أطول من {max} حرف', effortRange: 'المجهود لازم يكون من {min} لـ {max} دقيقة',
  waitRange: 'الانتظار لازم يكون لحد {max} دقيقة', badCategory: 'القسم مش معروف', badPeriod: 'الوقت مش معروف',
  notesTooLong: 'الملاحظات أطول من {max} حرف', badDate: 'التاريخ غير صحيح', badMinutes: 'اكتبي عدد دقايق صحيح', pickDay: 'اختاري يوم واحد على الأقل',
  saveFailed: 'ما قدرناش نحفظ. جربي تاني.', conflict: 'اتعدلت البيانات من مكان تاني. حدّثنا الصفحة.', storageFull: 'مساحة الموبايل خلصت. التعديل ما اتحفظش.',
  storageBlocked: 'المتصفح ده مش سامح بحفظ البيانات.',
  account: 'الحساب', signIn: 'تسجيل الدخول', signInSub: 'عشان بياناتك تتحفظ لو الموبايل ضاع أو اتغيّر',
  loginTitle: 'تسجيل الدخول', loginBody: 'اكتبي إيميلك أو رقم موبايلك، وهنبعتلك كود من ٦ أرقام.',
  contactPh: 'الإيميل أو رقم الموبايل', sendCode: 'ابعتي الكود', codeSentEmail: 'بعتنا إيميل على {to}. افتحيه على الموبايل ده ودوسي «Sign in» في الإيميل، وهترجعي ليومي وانتي داخلة.', haveCode: 'معايا كود', codeSentPhone: 'بعتنا رسالة على {to}',
  codePh: 'الكود', verify: 'دخول', changeContact: 'غيّري الإيميل أو الرقم', resend: 'ابعتي تاني',
  continueWithout: 'كمّلي من غير حساب', haveAccount: 'عندك حساب؟ سجّلي دخول',
  signedInAs: 'داخلة بـ {who}', signOut: 'تسجيل خروج', backupNow: 'احفظي نسخة دلوقتي', restoreCloud: 'رجّعي آخر نسخة من السحابة',
  lastBackup: 'آخر نسخة: {when}', neverBackedUp: 'لسه مفيش نسخة على السحابة', autoBackup: 'بنحفظ نسخة لوحدنا بعد كل تعديل.',
  backedUp: 'اتحفظت على السحابة', cloudRestoreAsk: 'لقينا نسخة من {when} على حسابك. نرجّعها على الموبايل ده؟', restoreYes: 'رجّعيها', restoreNo: 'لأ، خلّي اللي هنا',
  welcomeBack: 'أهلًا بيكي تاني',
  phoneUnavailable: 'الدخول برقم الموبايل لسه مش متاح. استخدمي الإيميل دلوقتي.', tooMany: 'استني دقيقة وجربي تاني.', badCode: 'الكود غلط أو انتهى. جربي تاني.',
  offline: 'مفيش نت. جربي تاني لما النت يرجع.', loginFailed: 'ما قدرناش ندخلك. جربي تاني.', badContact: 'اكتبي إيميل صحيح أو رقم موبايل زي ٠١٠١٢٣٤٥٦٧٨', signedOut: 'سجّلي دخول الأول.',
};

type Dict = typeof ar;
export type Key = keyof Dict;

const en: Dict = {
  appName: 'Yawmi',
  today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday',
  tabToday: 'Today', tabRoutines: 'Routines', tabHistory: 'History',
  settings: 'Settings',
  summary: '{done} of {total} done · about {left} left',
  summaryEmpty: 'A free day. Add your first task with ＋',
  summaryAllDone: 'Everything done for today ✓',
  periodmorning: 'Morning', periodafternoon: 'Afternoon', periodevening: 'Evening',
  overdue: 'From earlier days', moveAllToday: 'Move all to today',
  done: 'Done', doneCount: 'Done ({n})',
  catHome: 'Home', catFood: 'Food', catKids: 'Kids', catSelf: 'Me time', catOther: 'Other',
  effort: 'Effort', wait: 'Waiting time', waitHint: 'Like a washing machine or the oven: it runs by itself while you do something else.',
  noWait: 'None', when: 'When', day: 'Day', timeOfDay: 'Time of day', important: 'Important', notes: 'Notes', notesPh: 'Any details…',
  titlePh: "What's on your plate?", add: 'Add', save: 'Save', cancel: 'Cancel', delete: 'Delete', details: 'Details', close: 'Close',
  startTimer: 'Start', stopTimer: 'Stop', startWait: 'Start countdown', cancelWait: 'Cancel countdown',
  moveTomorrow: 'Tomorrow', moveTo: 'Move to another day', otherDay: 'Another day',
  swipeStart: 'Start', swipeTomorrow: 'Tomorrow',
  running: 'Running now', waitLeft: '{t} left', waitDone: 'Waiting done', waitDoneOf: '{title}: waiting done',
  ok: 'OK',
  undo: 'Undo', deleted: 'Deleted', addedOne: 'Added', addedMany: 'Added {n} tasks', movedTomorrow: 'Moved to tomorrow', saved: 'Saved',
  doneToast: 'Nice ✓', doneWaitToast: 'Nice ✓ Counting {t} of waiting',
  voiceListening: "Listening… say everything you've got", voiceTap: 'Tap the mic and talk, or type',
  voiceTypeOnly: "Type what's on your plate, or use your keyboard's mic",
  voiceExample: 'e.g. start the laundry, cook lunch in the afternoon, and tomorrow morning clean the bathroom for half an hour',
  voiceFound: 'Found {n}', voiceFoundOne: 'Found 1 task', voiceNothing: "Couldn't find tasks in that. Try again.",
  voiceGuess: 'guess', voiceReview: 'Check them, tap anything to change it',
  voiceMore: 'Add more', voiceAddAll: 'Add {n}', voiceStop: 'Done talking', voiceSpeak: 'Talk',
  voiceMicBlocked: 'The microphone is blocked. Allow it in Settings, or type.', voiceNoSpeech: "Didn't hear anything. Try again.",
  voicePermission: 'Yawmi needs microphone and speech permission. Allow it in Settings, or type.', voiceUnsupported: "This device doesn't support speech. Please type.",
  voiceFailed: "Couldn't listen. Try again or type.",
  priorityOn: '★ Important', priorityOff: '☆ Normal',
  plan: 'Suggested order', planHint: 'Just a suggestion, change it freely. There are 10-minute breaks between tasks.',
  planOver: 'Over your available time', planEmpty: 'Nothing waiting. A calm day ☼', planFits: '{used} of {cap} available. Time left for you.',
  planFull: '{used} of {cap} available. A full day; moving something to tomorrow is fine.', readyAt: 'Ready around {t}',
  emptyTitle: 'Start with something small?', emptyBody: 'Tap ＋ and say what you need to do, or pick one of these.',
  routinesTitle: 'Routines', routinesEmpty: 'Things that repeat, like laundry twice a week. Yawmi adds them to the right days.',
  newRoutine: 'New routine', editRoutine: 'Edit routine', repeatDays: 'Repeats on', paused: 'Paused', pause: 'Pause', resume: 'Resume',
  routineNote: 'Edits change upcoming days only. Pausing never deletes anything.', fromRoutine: 'From your routine', addNow: 'Add now',
  nextWeek: 'Next 7 days',
  historyTitle: 'History', historyHint: 'Time helps you plan. It is not a score for your day.',
  statDone: 'Done', statMinutes: 'effort minutes', statLeft: 'Left', adjust: 'Adjust time', expected: 'Planned {a}', tracked: 'Tracked {a}',
  adjustLabel: 'Actual time on this day (minutes)', historyEmpty: 'No tasks on this day.',
  setLanguage: 'Language', langAuto: 'Phone language', setName: 'Name', setCapacity: 'Effort available per day', setStart: 'Day plan starts at',
  setZone: 'Time zone', setData: 'Your data', backup: 'Back up', restore: 'Restore from file',
  dataLocal: 'Everything is stored on this phone only.', persistBest: 'Your phone may clear data when storage is low. Back up from time to time.',
  restoreConfirm: 'The file has {t} tasks and {r} routines. Restoring replaces your current data.', replace: 'Replace', restored: 'Your data is restored',
  backupSaved: 'Backup saved. Keep it somewhere safe.', notifications: 'Notifications', notifOn: "We'll alert you when waiting ends, even if the app is closed.",
  notifOff: 'Notifications are off. Turn them on in your phone settings.', notifWeb: 'Alerts show while Yawmi is open.',
  general: 'General', aboutDay: 'Your day', light: 'Light', normal: 'Normal', heavy: 'Heavy',
  welcome: 'Welcome to Yawmi', welcomeBody: 'Your day, at your pace: say what you need to do and Yawmi organizes it.', nameOptional: 'Your name (optional)',
  dayKind: 'How busy are your days usually?', start: "Let's start",
  greeting: 'Your day, {name}',
  update: 'A newer version is available.', updateNow: 'Update',
  invalidFile: "This file isn't a Yawmi backup.",
  titleRequired: 'Type a name for the task', titleTooLong: 'The name is longer than {max} characters', effortRange: 'Effort must be {min}–{max} minutes',
  waitRange: 'Waiting time can be up to {max} minutes', badCategory: 'Unknown category', badPeriod: 'Unknown time of day',
  notesTooLong: 'Notes are longer than {max} characters', badDate: 'Invalid date', badMinutes: 'Enter a valid number of minutes', pickDay: 'Pick at least one day',
  saveFailed: "Couldn't save. Try again.", conflict: 'Your data changed somewhere else. Reloaded.', storageFull: 'Phone storage is full. The change was not saved.',
  storageBlocked: "This browser doesn't allow saving data.",
  account: 'Account', signIn: 'Sign in', signInSub: 'So your data is safe if you lose or change your phone',
  loginTitle: 'Sign in', loginBody: "Enter your email or mobile number and we'll send you a 6-digit code.",
  contactPh: 'Email or mobile number', sendCode: 'Send code', codeSentEmail: 'We emailed {to}. Open it on this phone and tap Sign in; you’ll come back to Yawmi signed in.', haveCode: 'I have a code', codeSentPhone: 'We texted a code to {to}',
  codePh: 'Code', verify: 'Sign in', changeContact: 'Use a different email or number', resend: 'Send again',
  continueWithout: 'Continue without an account', haveAccount: 'Have an account? Sign in',
  signedInAs: 'Signed in as {who}', signOut: 'Sign out', backupNow: 'Back up now', restoreCloud: 'Restore latest cloud backup',
  lastBackup: 'Last backup: {when}', neverBackedUp: 'No cloud backup yet', autoBackup: 'We back up automatically after each change.',
  backedUp: 'Backed up to the cloud', cloudRestoreAsk: 'We found a backup from {when} on your account. Restore it on this phone?', restoreYes: 'Restore', restoreNo: "No, keep this phone's data",
  welcomeBack: 'Welcome back',
  phoneUnavailable: "Sign-in by mobile number isn't available yet. Please use email for now.", tooMany: 'Please wait a minute and try again.', badCode: 'That code is wrong or expired. Try again.',
  offline: "You're offline. Try again when you're connected.", loginFailed: "Couldn't sign you in. Try again.", badContact: 'Enter a valid email or a mobile number like 01012345678', signedOut: 'Please sign in first.',
};

const DICTS: Record<Locale, Dict> = { ar, en };

let current: Locale = 'ar';

export function resolveLocale(pref: Language): Locale {
  if (pref === 'ar' || pref === 'en') return pref;
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : ['ar'];
  for (const l of langs) {
    const base = (l || '').toLowerCase().split('-')[0];
    if (base in DICTS) return base as Locale;
  }
  return 'en';
}

export function setLocale(l: Locale): void {
  current = l;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  }
}
export const locale = () => current;
export const isRTL = () => current === 'ar';
/** List separator. A middle dot next to Arabic-Indic digits reads like the digit zero (٠), so Arabic uses a comma. */
export const sep = () => (current === 'ar' ? '، ' : ' · ');

export function t(key: Key | string, params: Record<string, string | number> = {}): string {
  const d = DICTS[current] as Record<string, string>;
  const s = d[key] ?? (DICTS.en as Record<string, string>)[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? fmtParam(params[k]) : `{${k}}`));
}
const fmtParam = (v: string | number) => (typeof v === 'number' ? n(v) : v);

// ---------- numbers, durations, clock, dates ----------

const nfCache: Record<string, Intl.NumberFormat> = {};
export function n(v: number): string {
  const tag = current === 'ar' ? 'ar-EG' : 'en-US';
  nfCache[tag] ??= new Intl.NumberFormat(tag, { useGrouping: false, maximumFractionDigits: 1 });
  return nfCache[tag].format(v);
}

/** 45 → "٤٥ د" / "45m"; 90 → "١ س ٣٠ د" / "1h 30m". */
export function dur(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (current === 'ar') return h ? (r ? `${n(h)} س ${n(r)} د` : `${n(h)} س`) : `${n(m)} د`;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${m}m`;
}

/** Minutes after midnight → "٩:٠٥ ص" / "9:05 AM". */
export function clock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  if (current === 'ar') return `${n(h12)}:${n(mm).padStart(2, n(0))} ${h24 < 12 ? 'ص' : 'م'}`;
  return `${h12}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** Milliseconds → "١٢:٣٤" / "12:34". */
export function stopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (v: number) => n(v).padStart(2, n(0));
  return h ? `${n(h)}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

const AR_DAYS = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
const AR_DAYS_SHORT = ['حد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekdayName(key: DayKey, short = false): string {
  const d = weekdayOf(key);
  if (current === 'ar') return (short ? AR_DAYS_SHORT : AR_DAYS)[d];
  return short ? EN_DAYS[d].slice(0, 3) : EN_DAYS[d];
}
export const weekdayByIndex = (d: number, short = false) =>
  current === 'ar' ? (short ? AR_DAYS_SHORT : AR_DAYS)[d] : short ? EN_DAYS[d].slice(0, 3) : EN_DAYS[d];

export function dayNum(key: DayKey): string {
  return n(Number(key.slice(8, 10)));
}

/** "الثلاثاء ١٣ أكتوبر" / "Tuesday, Oct 13". */
export function longDate(key: DayKey): string {
  const m = Number(key.slice(5, 7)) - 1;
  const d = Number(key.slice(8, 10));
  return current === 'ar' ? `${weekdayName(key)} ${n(d)} ${AR_MONTHS[m]}` : `${weekdayName(key)}, ${EN_MONTHS[m]} ${d}`;
}

/** First day of week: Saturday in Arabic (Egypt), Sunday in English. */
export const weekStartsOn = () => (current === 'ar' ? 6 : 0);

export const periodName = (p: Period) => t(`period${p}`);

const CAT_KEYS: Record<Category, Key> = { home: 'catHome', food: 'catFood', kids: 'catKids', self: 'catSelf', other: 'catOther' };
export const catName = (c: Category) => t(CAT_KEYS[c]);
export const CAT_ICON: Record<Category, string> = { home: '🏠', food: '🍳', kids: '📚', self: '☕', other: '🛒' };

export interface TemplateText { emoji: string; title: string }
export function templates(): { emoji: string; title: string; category: Category; effort: number; wait: number; period: Period; priority: boolean; notes: string }[] {
  const ar = current === 'ar';
  return [
    { emoji: '🧺', title: ar ? 'تشغيل الغسالة' : 'Start the laundry', category: 'home', effort: 10, wait: 50, period: 'morning', priority: false, notes: '' },
    { emoji: '🍳', title: ar ? 'تحضير الغدا' : 'Cook lunch', category: 'food', effort: 45, wait: 0, period: 'afternoon', priority: false, notes: '' },
    { emoji: '📚', title: ar ? 'مذاكرة مع الأولاد' : 'Homework with the kids', category: 'kids', effort: 40, wait: 0, period: 'evening', priority: false, notes: '' },
    { emoji: '☕', title: ar ? 'وقت لنفسي' : 'Time for myself', category: 'self', effort: 20, wait: 0, period: 'afternoon', priority: false, notes: '' }
  ];
}
