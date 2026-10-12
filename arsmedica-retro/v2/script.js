/* Grafik POZ: content/pages/_site-chrome.md (8:00–18:00, pn–pt).
   Gabinety 7:30–18.00 są osobną pozycją, nie godzinami rejestracji.
   Europe/Warsaw, bez sieci, cookies i pamięci przeglądarki. */
(() => {
  'use strict';
  const days = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
  const formatter = new Intl.DateTimeFormat('pl-PL', {timeZone:'Europe/Warsaw',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'});
  function easter(year) {
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
    return new Date(Date.UTC(year,Math.floor((h+l-7*m+114)/31)-1,(h+l-7*m+114)%31+1,12));
  }
  function holiday(date) {
    const y=date.getUTCFullYear(),key=`${date.getUTCMonth()+1}-${date.getUTCDate()}`;
    const fixed=['1-1','1-6','5-1','5-3','8-15','11-1','11-11','12-25','12-26'];
    if (y>=2025) fixed.push('12-24');
    if(fixed.includes(key)) return true;
    const sunday=easter(y);
    return [0,1,49,60].some(offset => {
      const feast=new Date(sunday);feast.setUTCDate(feast.getUTCDate()+offset);
      return feast.getTime()===date.getTime();
    });
  }
  const working = date => date.getUTCDay()>0 && date.getUTCDay()<6 && !holiday(date);
  const dateLabel = date => new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:'long',timeZone:'UTC'}).format(date);
  document.documentElement.classList.add('js');
  document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click',()=>window.print()));
  let lastDay;
  function update() {
    const parts=Object.fromEntries(formatter.formatToParts(new Date()).map(part=>[part.type,part.value]));
    const date=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day,12));
    const day=date.getUTCDay(), minutes=+parts.hour*60 + +parts.minute;
    const open=working(date)&&minutes>=480&&minutes<1080;
    let status;
    if(open) status='Rejestracja POZ: otwarte do 18:00';
    else {
      const next=new Date(date);
      if(!working(next)||minutes>=1080) {
        next.setUTCDate(next.getUTCDate()+1);
        while(!working(next)) next.setUTCDate(next.getUTCDate()+1);
      }
      status=`Rejestracja POZ: zamknięte. Otwarcie: ${days[next.getUTCDay()].toLocaleLowerCase('pl-PL')}, ${dateLabel(next)}, 8:00`;
    }
    document.querySelectorAll('[data-status]').forEach(el=> {if(el.textContent!==status) el.textContent=status;});
    document.querySelector('.status-strip')?.classList.toggle('is-open',open);
    document.querySelectorAll('[data-day]').forEach(el=> {
      const today=Number(el.dataset.day)===day;
      el.classList.toggle('is-today',today);
      const marker=el.querySelector('.today-marker');
      if(marker) marker.hidden=!today;
    });
    document.querySelectorAll('[data-today-date]').forEach(el=>el.textContent=`${days[day]}, ${dateLabel(date)}`);
    document.querySelectorAll('[data-today-hours]').forEach(el=> {
      el.textContent=working(date)?el.dataset.weekday:'Zamknięte';
    });
    // Mobile: today's day precedes Monday in DOM as well as visually.
    const list=document.querySelector('.day-list');
    if(list && lastDay!==day) {
      [...list.children].sort((a,b)=>(Number(a.dataset.day)+6)%7-(Number(b.dataset.day)+6)%7).forEach(el=>list.append(el));
      const today=list.querySelector(`[data-day="${day}"]`);
      if(today) {
        list.prepend(today);
        const doctors=today.querySelector("details");
        if(doctors) doctors.open=true;
      }
    }
    lastDay=day;
  }
  update();
  setInterval(update,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) update();});
})();
