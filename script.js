const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_CITY = 'القدس';

// رمز الطقس -> [الوصف، الأيقونة، السمة]
const WMO = {
  0: ['صافٍ', '☀️', 'clear'], 1: ['صافٍ غالبًا', '🌤️', 'clear'],
  2: ['غائم جزئيًا', '⛅', 'cloud'], 3: ['غائم', '☁️', 'cloud'],
  45: ['ضباب', '🌫️', 'fog'], 48: ['ضباب متجمد', '🌫️', 'fog'],
  51: ['رذاذ خفيف', '🌦️', 'rain'], 53: ['رذاذ', '🌦️', 'rain'], 55: ['رذاذ كثيف', '🌧️', 'rain'],
  56: ['رذاذ متجمد', '🌧️', 'rain'], 57: ['رذاذ متجمد كثيف', '🌧️', 'rain'],
  61: ['مطر خفيف', '🌧️', 'rain'], 63: ['مطر', '🌧️', 'rain'], 65: ['مطر غزير', '🌧️', 'rain'],
  66: ['مطر متجمد', '🌧️', 'rain'], 67: ['مطر متجمد غزير', '🌧️', 'rain'],
  71: ['ثلج خفيف', '🌨️', 'snow'], 73: ['ثلج', '🌨️', 'snow'], 75: ['ثلج كثيف', '❄️', 'snow'],
  77: ['حبيبات ثلج', '❄️', 'snow'],
  80: ['زخات مطر خفيفة', '🌦️', 'rain'], 81: ['زخات مطر', '🌧️', 'rain'], 82: ['زخات مطر غزيرة', '🌧️', 'rain'],
  85: ['زخات ثلج', '🌨️', 'snow'], 86: ['زخات ثلج كثيفة', '🌨️', 'snow'],
  95: ['عاصفة رعدية', '⛈️', 'storm'], 96: ['عاصفة رعدية مع برد', '⛈️', 'storm'], 99: ['عاصفة رعدية قوية مع برد', '⛈️', 'storm']
};

const $ = (s) => document.querySelector(s);
const state = { unit: 'c', place: null };
let requestId = 0;

// ---------- التخزين (اختياري، لا يؤثر على عمل التطبيق إذا فشل) ----------
function saveState() {
  try { localStorage.setItem('weather-app', JSON.stringify(state)); } catch (e) { /* تجاهل */ }
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('weather-app'));
    if (s && (s.unit === 'c' || s.unit === 'f')) state.unit = s.unit;
    if (s && s.place && typeof s.place.latitude === 'number') state.place = s.place;
  } catch (e) { /* تجاهل */ }
}

// ---------- واجهة الحالة ----------
function setStatus(text, retry) {
  const el = $('#status');
  el.className = '';
  el.textContent = text;
  if (retry) {
    el.classList.add('error');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'إعادة المحاولة';
    b.onclick = retry;
    el.append(b);
  }
}
function showError(text, retry) {
  setStatus(text, retry);
  $('#current').hidden = true;
  $('#daily').hidden = true;
}

// ---------- الشبكة ----------
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function searchCity(query) {
  const q = query.trim();
  if (!q) { showError('اكتب اسم مدينة أولًا.'); return; }
  setStatus('جارٍ البحث...');
  try {
    const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=5&language=ar&format=json`;
    const data = await getJSON(url);
    if (!data.results || !data.results.length) {
      $('#alts').hidden = true;
      showError(`ما لقينا مدينة باسم «${q}». جرّب كتابة الاسم بطريقة مختلفة.`);
      return;
    }
    showAlternatives(data.results);
    await loadPlace(data.results[0]);
  } catch (e) {
    showError('تعذّر الاتصال بالخدمة. تأكد من الإنترنت وحاول مرة ثانية.', () => searchCity(q));
  }
}

async function loadPlace(place) {
  const id = ++requestId;
  state.place = place;
  saveState();
  setStatus('جارٍ تحميل الطقس...');
  try {
    const f = state.unit === 'f';
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: 5,
      temperature_unit: f ? 'fahrenheit' : 'celsius',
      wind_speed_unit: f ? 'mph' : 'kmh'
    });
    const data = await getJSON(`${FORECAST_URL}?${params}`);
    if (id !== requestId) return; // وصل رد أقدم من طلب أحدث
    render(place, data);
    setStatus('');
  } catch (e) {
    if (id !== requestId) return;
    showError('تعذّر تحميل بيانات الطقس. حاول مرة ثانية.', () => loadPlace(place));
  }
}

// ---------- العرض ----------
function info(code, isDay) {
  const [text, icon, theme] = WMO[code] || ['غير معروف', '🌡️', 'cloud'];
  if (!isDay && (code === 0 || code === 1)) return { text, icon: '🌙', theme: 'night' };
  return { text, icon, theme };
}

function render(place, data) {
  const c = data.current;
  const unitTemp = state.unit === 'f' ? '°ف' : '°م';
  const cur = info(c.weather_code, c.is_day);

  document.body.dataset.theme = cur.theme;
  $('#city').textContent = place.name;
  $('#country').textContent = [place.admin1, place.country].filter(Boolean).join('، ');
  $('#desc').textContent = cur.text;
  $('#icon').textContent = cur.icon;
  $('#temp').textContent = Math.round(c.temperature_2m) + unitTemp;
  $('#feels').textContent = Math.round(c.apparent_temperature) + unitTemp;
  $('#hum').textContent = Math.round(c.relative_humidity_2m) + '%';
  $('#wind').textContent = Math.round(c.wind_speed_10m) + (state.unit === 'f' ? ' ميل/س' : ' كم/س');
  $('#current').hidden = false;

  const list = $('#days');
  list.innerHTML = '';
  data.daily.time.forEach((t, i) => {
    const d = info(data.daily.weather_code[i], true);
    const name = i === 0 ? 'اليوم'
      : new Date(t + 'T00:00').toLocaleDateString('ar-u-nu-latn', { weekday: 'long' });
    const li = document.createElement('li');
    const parts = [
      ['d-name', name],
      ['d-icon', d.icon],
      ['d-max', Math.round(data.daily.temperature_2m_max[i]) + '°'],
      ['d-min', Math.round(data.daily.temperature_2m_min[i]) + '°']
    ];
    parts.forEach(([cls, txt]) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = txt;
      if (cls === 'd-icon') { s.style.display = 'block'; s.setAttribute('aria-hidden', 'true'); }
      if (cls === 'd-name') { s.style.display = 'block'; }
      li.append(s);
    });
    list.append(li);
  });
  $('#daily').hidden = false;
}

function showAlternatives(results) {
  const box = $('#alts');
  box.innerHTML = '';
  if (results.length < 2) { box.hidden = true; return; }
  const label = document.createElement('span');
  label.textContent = 'نتائج أخرى:';
  box.append(label);
  results.slice(1).forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = [p.name, p.country].filter(Boolean).join('، ');
    b.onclick = () => { box.hidden = true; loadPlace(p); };
    box.append(b);
  });
  box.hidden = false;
}

// ---------- الأحداث ----------
$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  searchCity($('#q').value);
});

function setUnit(u) {
  state.unit = u;
  $('#uC').setAttribute('aria-pressed', u === 'c');
  $('#uF').setAttribute('aria-pressed', u === 'f');
  saveState();
  if (state.place) loadPlace(state.place);
}
$('#uC').onclick = () => setUnit('c');
$('#uF').onclick = () => setUnit('f');

$('#geoBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { showError('متصفحك لا يدعم تحديد الموقع.'); return; }
  setStatus('جارٍ تحديد موقعك...');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $('#alts').hidden = true;
      loadPlace({ name: 'موقعي الحالي', latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    },
    () => showError('ما قدرنا نحدد موقعك. اسمح للموقع بالوصول لموقعك أو ابحث عن مدينة يدويًا.')
  );
});

// ---------- البداية ----------
loadState();
$('#uC').setAttribute('aria-pressed', state.unit === 'c');
$('#uF').setAttribute('aria-pressed', state.unit === 'f');
if (state.place) loadPlace(state.place);
else searchCity(DEFAULT_CITY);
