/* مِشكاة — واجهة عربية مستقلة بدون مكتبات JavaScript خارجية */
'use strict';
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const AR = new Intl.NumberFormat('ar-SA');
const arabic = (n) => AR.format(n);
const toPlain = (s) => String(s ?? '').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').trim().toLowerCase();
const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getLocal = (key,def) => {try{let raw=localStorage.getItem('wird:'+key);return raw===null?def:JSON.parse(raw)}catch{return def}};
const setLocal = (key,value) => {try{localStorage.setItem('wird:'+key,JSON.stringify(value))}catch{}};
const CITIES = [
 {id:'makkah',name:'مكة المكرمة',city:'Makkah',country:'SA',timezone:'Asia/Riyadh'},
 {id:'jeddah',name:'جدة',city:'Jeddah',country:'SA',timezone:'Asia/Riyadh'},
 {id:'madinah',name:'المدينة المنورة',city:'Madinah',country:'SA',timezone:'Asia/Riyadh'},
 {id:'riyadh',name:'الرياض',city:'Riyadh',country:'SA',timezone:'Asia/Riyadh'},
 {id:'dammam',name:'الدمام',city:'Dammam',country:'SA',timezone:'Asia/Riyadh'},
 {id:'cairo',name:'القاهرة',city:'Cairo',country:'EG',timezone:'Africa/Cairo'},
 {id:'dubai',name:'دبي',city:'Dubai',country:'AE',timezone:'Asia/Dubai'},
 {id:'kuwait',name:'الكويت',city:'Kuwait',country:'KW',timezone:'Asia/Kuwait'},
 {id:'doha',name:'الدوحة',city:'Doha',country:'QA',timezone:'Asia/Qatar'},
 {id:'amman',name:'عمّان',city:'Amman',country:'JO',timezone:'Asia/Amman'},
 {id:'london',name:'لندن',city:'London',country:'GB',timezone:'Europe/London'},
 {id:'istanbul',name:'إسطنبول',city:'Istanbul',country:'TR',timezone:'Europe/Istanbul'},
 {id:'newyork',name:'نيويورك',city:'New York',country:'US',timezone:'America/New_York'}
];
const CALC = {'4':'أم القرى','3':'رابطة العالم الإسلامي','5':'الهيئة المصرية','8':'منطقة الخليج'};
const PRAYERS=[{key:'Fajr',name:'الفجر',symbol:'☾'},{key:'Dhuhr',name:'الظهر',symbol:'☼'},{key:'Asr',name:'العصر',symbol:'◈'},{key:'Maghrib',name:'المغرب',symbol:'◐'},{key:'Isha',name:'العشاء',symbol:'✦'}];
const ADHANS={afasy:'https://cdn.aladhan.com/audio/adhans/a9.mp3',nafees:'https://cdn.aladhan.com/audio/adhans/a1.mp3',zahrani:'https://cdn.aladhan.com/audio/adhans/a11-mansour-al-zahrani.mp3'};
const DEFAULT_SETTINGS={city:'makkah',method:'4',adhan:'afasy',autoAdhan:false,notify:false,coordinates:null};
let settings={...DEFAULT_SETTINGS,...getLocal('settings',{})};
let prayerToday=null, prayerTomorrow=null, prayerEvents=[],activePage='home',lastNotifyKey='',toaster;
let dailyTimer=null,prayerReqId=0,refreshCalendarDay='';
let adhkarCategory='morning', adhkarSearch='',adhkarCache=new Map(),adhkarItems=[],dhikrCounts=getLocal('dhikrCounts',{});
let afterPrayerType=getLocal('afterPrayerType','dhuhr');
let tasbeehPhrase=getLocal('tasbeehPhrase','سبحان الله'),tasbeehGoal=getLocal('tasbeehGoal',33),tasbeehCounts=getLocal('tasbeehCounts',{}),tasbeehTotal=getLocal('tasbeehTotal',0);
function notify(message){clearTimeout(toaster);const t=$('#toast');t.textContent=message;t.classList.add('show');toaster=setTimeout(()=>t.classList.remove('show'),3600)}
async function fetchJSON(url){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),17000);try{const r=await fetch(url,{signal:controller.signal,headers:{'Accept':'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);const data=await r.json();if(data.code!==undefined&&data.code!==200)throw new Error(data.status||'API failure');return data.data??data}finally{clearTimeout(timeout)}}
function getCity(){return CITIES.find(c=>c.id===settings.city)||CITIES[0]}
function getTZ(){return prayerToday?.meta?.timezone || getCity().timezone}
function dateParts(date,timeZone){const parts=new Intl.DateTimeFormat('en-GB',{timeZone,day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(date);const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {day:p.day,month:p.month,year:p.year}}
function dateSlug(date,timeZone){const p=dateParts(date,timeZone);return `${p.day}-${p.month}-${p.year}`}
function nextDateSlug(date,timeZone){const p=dateParts(date,timeZone);return dateSlug(new Date(Date.UTC(+p.year,+p.month-1,+p.day+1,12,0,0)), 'UTC')}
function formatTime(iso){if(!iso)return '—:—';const m=String(iso).match(/T(\d\d:\d\d)/);if(m)return m[1];const a=String(iso).match(/\d\d:\d\d/);return a?a[0]:'—:—'}
function dateAt(iso){const n=Date.parse(iso);return Number.isFinite(n)?n:null}
function formatClock(tz){return new Intl.DateTimeFormat('ar-SA',{timeZone:tz,day:'numeric',month:'long',year:'numeric',calendar:'gregory'}).format(new Date())}
function hijri(data){const h=data?.date?.hijri;return h?`${arabic(+h.day)} ${h.month.ar} ${arabic(+h.year)} هـ`:'—'}
function parseEvents(timings,dayOffset){return PRAYERS.map(p=>({ ...p,time:formatTime(timings?.[p.key]),at:dateAt(timings?.[p.key]),dayOffset })).filter(p=>p.at!==null)}
function currentNext(){return prayerEvents.find(p=>p.at>Date.now())||null}
function secondsString(sec){const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':')}
function renderPrayer(){const next=currentNext();const name=next?.name||'—';$('#heroPrayer').textContent=next?`صلاة ${name}`:'تعذّر تحديد الصلاة القادمة';$('#heroTime').textContent=next?`موعد الصلاة ${next.time} · ${getCity().name}`:'تحقّق من الاتصال بالإنترنت';
 const pidx=next?.key;const create=(p,full)=>`<div class="${full?'prayer-detail':'prayer-tile'} ${p.key===pidx?'upcoming':''}"><span class="p-icon">${p.symbol}</span><span class="p-label">${p.name}</span><span class="p-time">${formatTime(prayerToday?.timings?.[p.key])}</span></div>`;
 $('#homePrayerGrid').innerHTML=PRAYERS.map(p=>create(p,false)).join('');$('#fullPrayerGrid').innerHTML=PRAYERS.map(p=>create(p,true)).join('');
 $('#todayHijri').textContent=hijri(prayerToday);$('#prayerHijri').textContent=hijri(prayerToday);$('#prayerLocation').textContent=getCity().name;$('#cityName').textContent=getCity().name;$('#methodLabel').textContent=CALC[settings.method]||CALC[4];}
function clockTick(){const next=currentNext();$('#heroCountdown').textContent=next?secondsString(Math.max(0,Math.floor((next.at-Date.now())/1000))):'--:--:--';$('#headerDate').textContent=formatClock(getTZ());if(prayerToday && next && next.at<Date.now()+1500)renderPrayer();checkAdhan();const day=dateSlug(new Date(),getTZ());if(refreshCalendarDay&&refreshCalendarDay!==day){refreshCalendarDay=day;loadPrayerTimes();}}
async function loadPrayerTimes(){const id=++prayerReqId;const city=getCity();const tz=city.timezone;refreshCalendarDay=dateSlug(new Date(),tz);$('#cityName').textContent=city.name;$('#prayerLocation').textContent=city.name;$('#methodLabel').textContent=CALC[settings.method];$('#heroPrayer').textContent='جارٍ تحديد المواقيت...';$('#heroCountdown').textContent='--:--:--';prayerToday=null;prayerTomorrow=null;prayerEvents=[];
 const urlFor=(day)=>{let base=settings.city==='geo'&&settings.coordinates?`https://api.aladhan.com/v1/timings/${day}?latitude=${encodeURIComponent(settings.coordinates.lat)}&longitude=${encodeURIComponent(settings.coordinates.lng)}`:`https://api.aladhan.com/v1/timingsByCity/${day}?city=${encodeURIComponent(city.city)}&country=${encodeURIComponent(city.country)}`;return `${base}&method=${settings.method}&iso8601=true`};
 try{const today=await fetchJSON(urlFor(dateSlug(new Date(),tz)));if(id!==prayerReqId)return;prayerToday=today;prayerEvents=parseEvents(today.timings,0);renderPrayer();clockTick();const tomorrow=await fetchJSON(urlFor(nextDateSlug(new Date(),tz)));if(id!==prayerReqId)return;prayerTomorrow=tomorrow;prayerEvents=[...parseEvents(today.timings,0),...parseEvents(tomorrow.timings,1)].sort((a,b)=>a.at-b.at);renderPrayer();clockTick()}catch(err){if(id!==prayerReqId)return;renderPrayer();$('#heroTime').textContent='لم يتوفر اتصال بخدمة المواقيت';notify('تعذّر تحميل المواقيت. تحقق من اتصال الإنترنت.')}}
const audioPlayer=$('#audioPlayer');
function playAdhan(){const src=ADHANS[settings.adhan]||ADHANS.afasy;try{stopQuranRecitation();if(audioPlayer.src!==src)audioPlayer.src=src;audioPlayer.currentTime=0;audioPlayer.play().catch(()=>notify('اسمح بالتشغيل الصوتي أولًا عبر زر تجربة الأذان.'))}catch{notify('تعذّر تشغيل الأذان.')}}
function stopAdhan(){audioPlayer.pause();audioPlayer.currentTime=0}
function checkAdhan(){if(!prayerEvents.length)return;const now=Date.now();for(const e of prayerEvents){if(now<e.at||now-e.at>12000)continue;const stamp=`${e.key}:${e.at}`;if(lastNotifyKey===stamp)continue;lastNotifyKey=stamp;if(settings.autoAdhan)playAdhan();if(settings.notify&&typeof Notification!=='undefined'&&Notification.permission==='granted'){new Notification(`حان الآن وقت صلاة ${e.name}`,{body:`${getCity().name} · ${e.time}`,tag:stamp})}}}
function choosePage(page){const pages={home:'الرئيسية',prayer:'مواقيت الصلاة',quran:'القرآن الكريم',adhkar:'الأذكار والأدعية',tasbeeh:'السبحة الإلكترونية',ask:'المساعد الشرعي'};if(!pages[page])return;document.body.classList.toggle('quran-v6-open',page==='quran');activePage=page;$$('.page').forEach(el=>el.classList.toggle('active',el.id===`page-${page}`));$$('.nav-btn').forEach(el=>el.classList.toggle('active',el.dataset.page===page));$$('.mobile-bottom-nav button').forEach(el=>el.classList.toggle('active',el.dataset.go===page));$('#breadcrumb').textContent=pages[page];$('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});if(page==='quran')loadQuran();if(page==='adhkar'&&!adhkarItems.length)loadAdhkar()}
function setupNavigation(){$$('#mainNav [data-page]').forEach(el=>el.addEventListener('click',()=>choosePage(el.dataset.page)));$$('[data-go]').forEach(el=>el.addEventListener('click',()=>{if(el.dataset.adhkar){adhkarCategory=el.dataset.adhkar;adhkarSearch='';$('#adhkarSearch').value='';loadAdhkar()}choosePage(el.dataset.go)}));$('#mobileMenu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));document.addEventListener('click',e=>{if($('#sidebar').classList.contains('open')&&!e.target.closest('#sidebar')&&!e.target.closest('#mobileMenu'))$('#sidebar').classList.remove('open')})}
function showSettings(){const c=$('#citySelect');c.innerHTML=CITIES.map(o=>`<option value="${o.id}">${o.name}</option>`).join('')+`<option value="geo">موقعي الحالي (إحداثيات محفوظة)</option>`;c.value=settings.city;c.querySelector('[value="geo"]').disabled=!settings.coordinates;$('#methodSelect').value=settings.method;$('#adhanSelect').value=settings.adhan;$('#adhanToggle').checked=settings.autoAdhan;$('#notifyToggle').checked=settings.notify;$('#settingsOverlay').classList.remove('hidden');$('#closeSettings').focus()}
function hideSettings(){$('#settingsOverlay').classList.add('hidden')}
function setupSettings(){['#sidebarSettings','#headerSettings','#cityButton','#prayerSettings'].forEach(id=>$(id).addEventListener('click',showSettings));$('#closeSettings').addEventListener('click',hideSettings);$('#settingsOverlay').addEventListener('click',e=>{if(e.target.id==='settingsOverlay')hideSettings()});document.addEventListener('keydown',e=>{if(e.key==='Escape')hideSettings()});$('#useGeolocation').addEventListener('click',()=>{if(!navigator.geolocation){notify('المتصفح لا يدعم تحديد الموقع');return}navigator.geolocation.getCurrentPosition(pos=>{settings.coordinates={lat:pos.coords.latitude,lng:pos.coords.longitude};settings.city='geo';CITIES.find(c=>c.id==='geo')||CITIES.push({id:'geo',name:'موقعي الحالي',city:'',country:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Riyadh'});$('#citySelect').querySelector('[value="geo"]').disabled=false;$('#citySelect').value='geo';notify('تم تحديد الموقع. اضغط حفظ التغييرات.')},()=>notify('تعذّر تحديد الموقع أو لم تسمح بالوصول إليه.'),{enableHighAccuracy:false,timeout:10000,maximumAge:60000})});$('#modalTestAdhan').addEventListener('click',()=>{const prev=settings.adhan;settings.adhan=$('#adhanSelect').value;playAdhan();settings.adhan=prev});$('#saveSettings').addEventListener('click',async()=>{settings.city=$('#citySelect').value;settings.method=$('#methodSelect').value;settings.adhan=$('#adhanSelect').value;settings.autoAdhan=$('#adhanToggle').checked;settings.notify=$('#notifyToggle').checked;if(settings.city==='geo'&&!CITIES.some(c=>c.id==='geo'))CITIES.push({id:'geo',name:'موقعي الحالي',city:'',country:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Riyadh'});setLocal('settings',settings);$('#prayerAdhanSelect').value=settings.adhan;hideSettings();notify('تم حفظ إعداداتك.');if(settings.notify&&'Notification'in window&&Notification.permission==='default'){try{await Notification.requestPermission()}catch{}}loadPrayerTimes()});$('#testAdhan').addEventListener('click',()=>{settings.adhan=$('#prayerAdhanSelect').value;setLocal('settings',settings);playAdhan()});$('#prayerAdhanSelect').addEventListener('change',e=>{settings.adhan=e.target.value;setLocal('settings',settings)});$('#stopAdhan').addEventListener('click',()=>{stopAdhan();notify('تم إيقاف الأذان.')});$('#prayerAdhanSelect').value=settings.adhan}
function loadQuran(){const f=$('#mushafFrame');if(!f.getAttribute('src'))f.src='./mushaf.html'+(location.hash.startsWith('#quran')?location.hash:'')}
function stopQuranRecitation(){$('#mushafFrame')?.contentWindow?.postMessage({type:'mishkat-reader-stop'},location.origin)}
function setupQuran(){window.addEventListener('message',e=>{if(e.origin!==location.origin)return;if(e.data?.type==='mishkat-reader-close')choosePage('home');if(e.data?.type==='mishkat-reader-play')stopAdhan()})}
// Categories are downloaded on demand from a public, attributed azkar dataset.
const ADHKAR_CATEGORIES=[
 {id:'morning',label:'أذكار الصباح',file:'azkar-sabah.json'}, {id:'evening',label:'أذكار المساء',file:'azkar-masaa.json'},
 {id:'after',label:'بعد الصلاة',file:'after_prayer.json'}, {id:'sleep',label:'النوم',file:'sleep.json'},
 {id:'food',label:'الطعام',file:'food.json'}, {id:'travel',label:'السفر',file:'travel.json'},
 {id:'home',label:'المنزل',file:'home.json'}, {id:'mosque',label:'المسجد',file:'mosque.json'},
 {id:'wudu',label:'الوضوء',file:'wudu.json'}, {id:'ruqyah',label:'الرقية الشرعية',file:'ruqyah-shariah.json'},
 {id:'duas',label:'أدعية متنوعة',file:'famous-doaa.json'}, {id:'brief',label:'أذكار مختصرة',file:'morning_evening.json'},
 {id:'deceased',label:'الدعاء للميت',file:'doaa-for-dead-person.json'}, {id:'deceasedall',label:'الدعاء للمسلمين المتوفين',file:'doaa-for-all-death-people.json'}
];
// Manually reviewed minimal fallback. Primary dataset contains many more items.
const ADHKAR_FALLBACK={
 morning:[{zekr:'اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ',repeat:1,reference:'من أذكار الصباح'},{zekr:'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',repeat:100,reference:'صحيح مسلم'},{zekr:'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',repeat:3,reference:'أبو داود والترمذي'}],
 evening:[{zekr:'اللَّهُمَّ بِكَ أَمْسَيْنَا وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ',repeat:1,reference:'من أذكار المساء'},{zekr:'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',repeat:100,reference:'صحيح مسلم'}],
 after:[{zekr:'أَسْتَغْفِرُ اللَّهَ',repeat:3,reference:'صحيح مسلم'},{zekr:'اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ',repeat:1,reference:'صحيح مسلم'}],
 sleep:[{zekr:'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا',repeat:1,reference:'صحيح البخاري'}],
 food:[{zekr:'بِسْمِ اللَّهِ',repeat:1,reference:'دعاء بدء الطعام'},{zekr:'الْحَمْدُ لِلَّهِ',repeat:1,reference:'الحمد لله بعد الطعام'}],
 travel:[{zekr:'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَٰذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ ۝ وَإِنَّا إِلَىٰ رَبِّنَا لَمُنقَلِبُونَ',repeat:1,reference:'سورة الزخرف: ١٣-١٤'}],
 home:[{zekr:'بِسْمِ اللَّهِ',repeat:1,reference:'ذكر الله عند الدخول'}],
 mosque:[{zekr:'اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ',repeat:1,reference:'ذكر دخول المسجد ـ صحيح مسلم'},{zekr:'اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ',repeat:1,reference:'ذكر الخروج من المسجد ـ صحيح مسلم'}],
 wudu:[{zekr:'أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ',repeat:1,reference:'صحيح مسلم ـ بعد الوضوء'}],
 ruqyah:[{zekr:'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',repeat:3,reference:'صحيح مسلم'}],
 duas:[{zekr:'لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ',repeat:1,reference:'سورة الأنبياء: ٨٧'},{zekr:'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ',repeat:1,reference:'سورة البقرة: ٢٠١'}],
 brief:[{zekr:'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',repeat:100,reference:'صحيح مسلم'},{zekr:'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',repeat:100,reference:'صحيح البخاري ومسلم'}],
 deceased:[{zekr:'اللَّهُمَّ اغْفِرْ لَهُ وَارْحَمْهُ وَعَافِهِ وَاعْفُ عَنْهُ',repeat:1,reference:'من الدعاء للميت ـ صحيح مسلم'}],
 deceasedall:[{zekr:'رَبَّنَا اغْفِرْ لَنَا وَلِإِخْوَانِنَا الَّذِينَ سَبَقُونَا بِالْإِيمَانِ',repeat:1,reference:'سورة الحشر: ١٠'}]
};

// هذه الأبواب محفوظة داخل الموقع ولا تعتمد على ملف خارجي قد يتعطل.
// النصوص أدعية مأثورة وآيات قرآنية، مع بيان المصدر والعدد الصحيح حيث ورد.
const AYAT_ALKURSI='اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ';
const SURAH_IKHLAS='قُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ';
const SURAH_FALAQ='قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ۝ مِنْ شَرِّ مَا خَلَقَ ۝ وَمِنْ شَرِّ غَاسِقٍ إِذَا وَقَبَ ۝ وَمِنْ شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ۝ وَمِنْ شَرِّ حَاسِدٍ إِذَا حَسَدَ';
const SURAH_NAS='قُلْ أَعُوذُ بِرَبِّ النَّاسِ ۝ مَلِكِ النَّاسِ ۝ إِلَٰهِ النَّاسِ ۝ مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ۝ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ۝ مِنَ الْجِنَّةِ وَالنَّاسِ';
const CORE_ADHKAR={
 after:[
  {zekr:'أَسْتَغْفِرُ اللَّهَ',repeat:3,reference:'صحيح مسلم · عقب السلام'},
  {zekr:'اللَّهُمَّ أَنْتَ السَّلَامُ، وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ',repeat:1,reference:'صحيح مسلم · عقب السلام'},
  {zekr:'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',repeat:1,reference:'صحيح مسلم · من الأذكار بعد الصلاة'},
  {zekr:'اللَّهُمَّ لَا مَانِعَ لِمَا أَعْطَيْتَ، وَلَا مُعْطِيَ لِمَا مَنَعْتَ، وَلَا يَنْفَعُ ذَا الْجَدِّ مِنْكَ الْجَدُّ',repeat:1,reference:'صحيح البخاري ومسلم'},
  {zekr:'سُبْحَانَ اللَّهِ',repeat:33,reference:'صحيح مسلم · ثلاث وثلاثون مرة'},
  {zekr:'الْحَمْدُ لِلَّهِ',repeat:33,reference:'صحيح مسلم · ثلاث وثلاثون مرة'},
  {zekr:'اللَّهُ أَكْبَرُ',repeat:33,reference:'صحيح مسلم · ثلاث وثلاثون مرة'},
  {zekr:'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',repeat:1,reference:'صحيح مسلم · تتمة المئة بعد التسبيح والتحميد والتكبير'},
  {zekr:AYAT_ALKURSI,repeat:1,reference:'آية الكرسي · البقرة: ٢٥٥'},
  {zekr:SURAH_IKHLAS,repeat:1,repeatFajrMaghrib:3,reference:'سورة الإخلاص · مرة بعد الظهر والعصر والعشاء، وثلاثًا بعد الفجر والمغرب'},
  {zekr:SURAH_FALAQ,repeat:1,repeatFajrMaghrib:3,reference:'سورة الفلق · مرة بعد الظهر والعصر والعشاء، وثلاثًا بعد الفجر والمغرب'},
  {zekr:SURAH_NAS,repeat:1,repeatFajrMaghrib:3,reference:'سورة الناس · مرة بعد الظهر والعصر والعشاء، وثلاثًا بعد الفجر والمغرب'}
 ],
 sleep:[
  {zekr:AYAT_ALKURSI,repeat:1,reference:'آية الكرسي · البقرة: ٢٥٥ · تقرأ قبل النوم'},
  {zekr:SURAH_IKHLAS,repeat:3,reference:'سورة الإخلاص · مع المعوذتين ثلاث مرات قبل النوم'},
  {zekr:SURAH_FALAQ,repeat:3,reference:'سورة الفلق · مع الإخلاص والناس ثلاث مرات قبل النوم'},
  {zekr:SURAH_NAS,repeat:3,reference:'سورة الناس · مع الإخلاص والفلق ثلاث مرات قبل النوم'},
  {zekr:'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا',repeat:1,reference:'صحيح البخاري'},
  {zekr:'بِاسْمِكَ رَبِّي وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، إِنْ أَمْسَكْتَ نَفْسِي فَارْحَمْهَا، وَإِنْ أَرْسَلْتَهَا فَاحْفَظْهَا بِمَا تَحْفَظُ بِهِ عِبَادَكَ الصَّالِحِينَ',repeat:1,reference:'صحيح البخاري ومسلم'},
  {zekr:'اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ',repeat:3,reference:'أبو داود والترمذي · ثلاث مرات'},
  {zekr:'سُبْحَانَ اللَّهِ',repeat:33,reference:'الصحيحان · ذكر النوم'},
  {zekr:'الْحَمْدُ لِلَّهِ',repeat:33,reference:'الصحيحان · ذكر النوم'},
  {zekr:'اللَّهُ أَكْبَرُ',repeat:34,reference:'الصحيحان · ذكر النوم'},
  {zekr:'اللَّهُمَّ أَسْلَمْتُ نَفْسِي إِلَيْكَ، وَفَوَّضْتُ أَمْرِي إِلَيْكَ، وَوَجَّهْتُ وَجْهِي إِلَيْكَ، وَأَلْجَأْتُ ظَهْرِي إِلَيْكَ، رَغْبَةً وَرَهْبَةً إِلَيْكَ، لَا مَلْجَأَ وَلَا مَنْجَا مِنْكَ إِلَّا إِلَيْكَ، آمَنْتُ بِكِتَابِكَ الَّذِي أَنْزَلْتَ، وَبِنَبِيِّكَ الَّذِي أَرْسَلْتَ',repeat:1,reference:'صحيح البخاري ومسلم · اجعله آخر كلامك قبل النوم'}
 ],
 brief:[
  {zekr:AYAT_ALKURSI,repeat:1,reference:'آية الكرسي · من الأذكار المشروعة في اليوم والليلة'},
  {zekr:SURAH_IKHLAS,repeat:3,reference:'سورة الإخلاص · ثلاثًا في الصباح أو المساء'},
  {zekr:SURAH_FALAQ,repeat:3,reference:'سورة الفلق · ثلاثًا في الصباح أو المساء'},
  {zekr:SURAH_NAS,repeat:3,reference:'سورة الناس · ثلاثًا في الصباح أو المساء'},
  {zekr:'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',repeat:3,reference:'أبو داود والترمذي · ثلاثًا صباحًا ومساءً'},
  {zekr:'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',repeat:3,reference:'صحيح مسلم · من أذكار المساء'},
  {zekr:'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',repeat:100,reference:'صحيح مسلم · مئة مرة في اليوم'}
 ]
};
const CORE_ADHKAR_SOURCES={
  after:'المصدر: أذكار أدبار الصلوات · موقع ابن باز | بعد الفجر والمغرب تتكرر السور الثلاث ٣ مرات',
  sleep:'المصدر: السنن العملية قبل النوم · موقع ابن باز، والأحاديث المشار إليها في كل بطاقة',
  brief:'مختارات مختصرة من الأذكار الثابتة؛ ليست صيغة واجبة أو ترتيبًا مخصصًا في السنة'
};
const ADHKAR_BASE='https://cdn.jsdelivr.net/gh/mohammed-2-5/islamic-library-data@master/azkar/';
function normalizeDhikr(entry,i,cat){
  const z=entry.zekr||entry.text||entry.zikr||entry.arabic||'';
  let reps=parseInt(entry.repeat||entry.count||1,10);
  if(!Number.isInteger(reps)||reps<1||reps>1000)reps=1;
  return {id:`${cat}-${i}`,category:cat,text:z,repeat:reps,repeatFajrMaghrib:entry.repeatFajrMaghrib||0,ref:entry.reference||entry.description||entry.bless||''};
}
async function getAdhkar(cat){
  if(adhkarCache.has(cat))return adhkarCache.get(cat);
  const category=ADHKAR_CATEGORIES.find(x=>x.id===cat);
  if(!category)return {items:[],fallback:true};
  let raw;let fallback=false;
  if(CORE_ADHKAR[cat]){
    raw=CORE_ADHKAR[cat];
  }else{
    try{
      raw=await fetchJSON(ADHKAR_BASE+category.file);
      if(!Array.isArray(raw))raw=raw.data||raw.azkar||raw.items;
      if(!Array.isArray(raw))throw Error('invalid');
    }catch{raw=ADHKAR_FALLBACK[cat]||[];fallback=true;}
  }
  const items=raw.map((a,i)=>normalizeDhikr(a,i,cat)).filter(a=>a.text);
  const value={items,fallback};adhkarCache.set(cat,value);return value;
}
function currentAdhkarItems(){
  return adhkarItems.map(a=>adhkarCategory==='after'?{
    ...a,
    id:`${a.id}-${afterPrayerType}`,
    repeat:a.repeatFajrMaghrib&&['fajr','maghrib'].includes(afterPrayerType)?a.repeatFajrMaghrib:a.repeat
  }:a).filter(a=>toPlain(a.text).includes(toPlain(adhkarSearch)));
}
async function loadAdhkar(){
  const myCat=adhkarCategory;
  $('#adhkarList').innerHTML='<div class="loading-card">جارٍ تحميل الأذكار...</div>';
  $('#adhkarCurrentTitle').textContent=ADHKAR_CATEGORIES.find(c=>c.id===myCat)?.label||'الأذكار';
  $('#afterPrayerPicker').classList.toggle('hidden',myCat!=='after');
  $('#afterPrayerSelect').value=afterPrayerType;
  renderAdhkarCategories();
  const result=await getAdhkar(myCat);
  if(myCat!==adhkarCategory)return;
  adhkarItems=result.items;
  $('#adhkarSource').textContent=CORE_ADHKAR_SOURCES[myCat]||(
    result.fallback?'نسخة مختصرة متاحة حاليًا · تعذّر تنزيل المجموعة الكاملة':'محتوى الأذكار من مجموعة بيانات إسلامية مفتوحة · يُنصح بمراجعة التخريج قبل النشر'
  );
  renderAdhkar();
}
function renderAdhkarCategories(){
  $('#adhkarCategories').innerHTML=ADHKAR_CATEGORIES.map(c=>`<button class="category-pill ${c.id===adhkarCategory?'active':''}" data-cat="${c.id}">${c.label}</button>`).join('');
  $$('[data-cat]',$('#adhkarCategories')).forEach(b=>b.addEventListener('click',()=>{adhkarCategory=b.dataset.cat;loadAdhkar()}));
}
function renderAdhkar(){
  const data=currentAdhkarItems();
  let completed=0;
  const html=data.map((a,i)=>{
    const have=Math.min(dhikrCounts[a.id]||0,a.repeat);
    if(have>=a.repeat)completed++;
    return `<article class="dhikr-card"><div class="dhikr-top"><span class="dhikr-num">الذكر ${arabic(i+1)}</span><span class="dhikr-repeat">التكرار: ${arabic(a.repeat)}</span></div><div class="dhikr-content">${escapeHTML(a.text)}</div><div class="dhikr-foot"><span class="dhikr-ref">${escapeHTML(String(a.ref).slice(0,270))}</span><button class="dhikr-countbtn ${have>=a.repeat?'done':''}" data-dhikr="${a.id}">${have>=a.repeat?'✓ اكتمل':`${arabic(have)} / ${arabic(a.repeat)} · اضغط للعد`}</button></div></article>`;
  }).join('');
  $('#adhkarList').innerHTML=html||'<div class="loading-card">لا توجد نتائج مطابقة لهذا البحث.</div>';
  $('#adhkarProgress').textContent=`اكتمل ${arabic(completed)} من ${arabic(data.length)} ذكر`;
  $$('[data-dhikr]',$('#adhkarList')).forEach(b=>b.addEventListener('click',()=>{
    const a=data.find(x=>x.id===b.dataset.dhikr);if(!a)return;
    dhikrCounts[a.id]=Math.min(a.repeat,(dhikrCounts[a.id]||0)+1);
    setLocal('dhikrCounts',dhikrCounts);renderAdhkar();
  }));
}
function setupAdhkar(){
  $('#adhkarSearch').addEventListener('input',e=>{adhkarSearch=e.target.value;renderAdhkar()});
  $('#afterPrayerSelect').value=afterPrayerType;
  $('#afterPrayerSelect').addEventListener('change',e=>{
    afterPrayerType=e.target.value;setLocal('afterPrayerType',afterPrayerType);renderAdhkar();
  });
  $('#resetAdhkar').addEventListener('click',()=>{
    if(confirm('تصفير عدادات الأذكار في هذا الباب؟')){
      currentAdhkarItems().forEach(a=>delete dhikrCounts[a.id]);
      setLocal('dhikrCounts',dhikrCounts);renderAdhkar();notify('تم تصفير عدادات هذا الباب');
    }
  });
  renderAdhkarCategories();
}
function renderTasbeeh(){const n=tasbeehCounts[tasbeehPhrase]||0;const percentage=tasbeehGoal?Math.min(100,Math.floor(100*(n%tasbeehGoal)/tasbeehGoal)):100;const shownPercentage=tasbeehGoal&&n>0&&n%tasbeehGoal===0?100:percentage;$('#tasbeehCount').textContent=arabic(n);$('#tasbeehPhrase').textContent=tasbeehPhrase;$('#tasbeehTotal').textContent=arabic(tasbeehTotal);$('#tasbeehPercent').textContent=tasbeehGoal?`${arabic(shownPercentage)}٪`:'∞';$('#tasbeehActivePhrase').textContent=tasbeehPhrase;$('#tasbeehTap').style.background=`conic-gradient(#2d9e77 ${shownPercentage}%, #edf4ed ${shownPercentage}%)`;$$('.dhikr-pill').forEach(el=>el.classList.toggle('active',el.dataset.phrase===tasbeehPhrase));$('#tasbeehGoal').value=String(tasbeehGoal)}
function tapTasbeeh(){const old=tasbeehCounts[tasbeehPhrase]||0;tasbeehCounts[tasbeehPhrase]=old+1;tasbeehTotal++;setLocal('tasbeehCounts',tasbeehCounts);setLocal('tasbeehTotal',tasbeehTotal);renderTasbeeh();if(tasbeehGoal&&(old+1)%tasbeehGoal===0)notify(`ما شاء الله، أكملت ${arabic(tasbeehGoal)} تسبيحة.`)}
function setupTasbeeh(){$('#tasbeehTap').addEventListener('click',tapTasbeeh);$$('.dhikr-pill').forEach(el=>el.addEventListener('click',()=>{tasbeehPhrase=el.dataset.phrase;setLocal('tasbeehPhrase',tasbeehPhrase);renderTasbeeh()}));$('#tasbeehGoal').addEventListener('change',e=>{tasbeehGoal=+e.target.value;setLocal('tasbeehGoal',tasbeehGoal);renderTasbeeh()});$('#tasbeehReset').addEventListener('click',()=>{if(confirm('تصفير عداد الذكر الحالي فقط؟')){tasbeehCounts[tasbeehPhrase]=0;setLocal('tasbeehCounts',tasbeehCounts);renderTasbeeh();notify('تم تصفير هذا الذكر')}});document.addEventListener('keydown',e=>{if(e.code==='Space'&&activePage==='tasbeeh'&&!e.repeat&&!e.target.closest('input,textarea,select,button')){e.preventDefault();tapTasbeeh()}});renderTasbeeh()}
// Online AI cannot be invoked securely without an operator-controlled server API key.
const TRUSTED=[{name:'ابن باز',domain:'binbaz.org.sa',home:'https://binbaz.org.sa'},{name:'إسلام ويب',domain:'islamweb.net',home:'https://www.islamweb.net'},{name:'الإسلام سؤال وجواب',domain:'islamqa.info',home:'https://islamqa.info/ar'},{name:'الدرر السنية',domain:'dorar.net',home:'https://dorar.net'}];
function renderSearchAlternatives(q){$('#searchAlternative').classList.remove('hidden');$('#altLinks').innerHTML=TRUSTED.map(s=>`<a href="https://www.google.com/search?q=${encodeURIComponent(`site:${s.domain} ${q}`)}" target="_blank" rel="noopener noreferrer">ابحث في ${s.name} ↗</a>`).join('')}
async function handleQuestion(e){e.preventDefault();const q=$('#askQuestion').value.trim();if(q.length<5){notify('يرجى كتابة سؤال أوضح');return}const btn=$('#askSubmit');btn.disabled=true;btn.textContent='جارٍ البحث في المصادر...';$('#askAnswer').classList.remove('hidden');$('#answerText').textContent='جارٍ البحث...';$('#answerSources').innerHTML='';$('#searchAlternative').classList.add('hidden');try{const res=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q})});const data=await res.json();if(!res.ok)throw Error(data.error||'تعذّر الاتصال بالمساعد');$('#answerText').textContent=data.answer||'لا توجد إجابة كافية موثقة.';const sources=(data.sources||[]).filter(s=>{try{return new URL(s.url).protocol==='https:'&&TRUSTED.some(t=>new URL(s.url).hostname===t.domain||new URL(s.url).hostname.endsWith('.'+t.domain))}catch{return false}});$('#answerSources').innerHTML=sources.map((s,i)=>`<a target="_blank" rel="noopener noreferrer" href="${escapeHTML(s.url)}">المصدر ${arabic(i+1)}: ${escapeHTML((s.title||new URL(s.url).hostname).slice(0,68))} ↗</a>`).join('');if(!sources.length)$('#answerText').textContent+='\n\nلم تُرفق مصادر قابلة للتحقق؛ لا تعتمد على الإجابة دون مراجعة.'}catch(err){$('#answerText').textContent=err.message==='Failed to fetch'?'المساعد غير متاح الآن. يتطلب تشغيل الموقع عبر الخادم وإعداد مفتاح API.':err.message;renderSearchAlternatives(q)}finally{btn.disabled=false;btn.innerHTML=`إرسال السؤال ${icon('arrow')}`}}
function setupAsk(){$('#askForm').addEventListener('submit',handleQuestion);$$('.suggestion').forEach(b=>b.addEventListener('click',()=>{$('#askQuestion').value=b.dataset.question;$('#askQuestion').focus()}))}
function init(){if(settings.city==='geo'&&settings.coordinates&&!CITIES.some(c=>c.id==='geo'))CITIES.push({id:'geo',name:'موقعي الحالي',city:'',country:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Riyadh'});setupNavigation();setupSettings();setupQuran();setupAdhkar();setupTasbeeh();setupAsk();if(location.hash.startsWith('#quran'))choosePage('quran');loadPrayerTimes();clockTick();setInterval(clockTick,1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)clockTick()})}
document.addEventListener('DOMContentLoaded',init);
