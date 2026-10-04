// The scene keeps Rızgar's clock (Istanbul), not the visitor's: the sky follows
// the time of day in Ankara, and the smithy guesses where he probably is.
const TZ = 'Europe/Istanbul';

export function localNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  const hour = Number(parts.hour) + Number(parts.minute) / 60;
  return { hour, day, label: `${parts.hour}:${parts.minute}` };
}

// 0 = deep night, 1 = full day, with dawn and dusk ramps (Ankara, roughly).
export function daylight(hour) {
  const ramp = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  return ramp(5.5, 8, hour) * (1 - ramp(18, 20.5, hour));
}

// Where he most likely is right now, in his own words (the board's "ŞU AN" line), in the page's language.
// working = the hammer is going.
const WHERE = {
  tr: {
    sleep: 'Büyük ihtimalle uyuyorum; ocak kor hâlinde bekliyor.',
    school: 'Akşam 5’e kadar okuldayım.',
    morning: 'Güne başlıyorum; ocağı yeni yaktım.',
    forge: 'Büyük ihtimalle örsün başındayım.',
  },
  en: {
    sleep: 'Probably asleep; the fire is down to embers.',
    school: 'At school until 5 pm.',
    morning: 'Starting the day; I just lit the fire.',
    forge: 'Probably at the anvil.',
  },
};
export function whereabouts(now = localNow()) {
  const { hour, day } = now;
  const weekday = day >= 1 && day <= 5;
  const key = hour >= 1.5 && hour < 8 ? 'sleep' : weekday && hour >= 9 && hour < 17 ? 'school' : hour >= 8 && hour < 9 ? 'morning' : 'forge';
  const words = WHERE[document.documentElement.lang === 'en' ? 'en' : 'tr'];
  return { key, working: key === 'forge', text: words[key] };
}
