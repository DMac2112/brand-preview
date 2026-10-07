(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const viewport = $('#project-viewport');
  const visual = $('#project-visual');
  const enter = $('#enter-link');
  const count = $('#project-count');
  const copy = $('#project-copy');
  const shell = $('#portal-shell');
  const backdrop = $('#portal-backdrop');
  const screen = $('#portal-screen');
  const portalImage = $('#portal-image');
  const errorBox = $('#portal-error');
  const errorLink = $('#portal-error-link');
  const external = $('#portal-external');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const variant = ['1','2','3'].includes(new URLSearchParams(location.search).get('v')) ? new URLSearchParams(location.search).get('v') : '1';
  document.documentElement.classList.add(`v${variant}`);
  let projects = window.PROTO_PROJECTS || [];
  let current = 2;
  let inside = false;
  let token = 0;
  let timeout = 0;
  let closing = false;
  let touchStart = null;
  let priorState = null;
  let priorUrl = '';

  function slideFor(project) {
    const slide = document.createElement(project.image ? 'div' : 'div');
    slide.className = project.image ? 'project-slide' : 'project-slide project-placeholder';
    if (project.image) {
      const img = document.createElement('img');
      img.src = project.image;
      img.alt = `Podgląd: ${project.label}`;
      slide.append(img);
    } else {
      const title = document.createElement('strong');
      title.textContent = project.label;
      slide.append(title);
    }
    return slide;
  }

  function show(index, motion = true) {
    if (!projects.length) return;
    const next = (index + projects.length) % projects.length;
    if (next === current && viewport.firstElementChild) return;
    const old = viewport.lastElementChild;
    const direction = index > current ? '-14%' : '14%';
    current = next;
    const project = projects[current];
    const slide = slideFor(project);
    if (!motion || reduceMotion.matches) slide.style.animation = 'none';
    viewport.append(slide);
    if (old) {
      if (motion && !reduceMotion.matches) {
        old.style.setProperty('--slide-direction',direction);
        old.style.zIndex = '2';
        old.classList.add('is-leaving');
        setTimeout(() => old.remove(),480);
        dispatchEvent(new Event('metal:ripple'));
      } else old.remove();
    }
    count.textContent = `${current + 1} / ${projects.length}`;
    copy.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = project.label;
    const description = document.createElement('span');
    description.textContent = project.description;
    const status = document.createElement('small');
    status.textContent = project.url ? project.status : `${project.status} · Podgląd`;
    copy.append(title,description,status);
    visual.setAttribute('aria-label',`${project.label}. ${project.description}`);
    enter.hidden = !project.url;
    if (project.url) enter.href = project.url;
  }

  $('#prev-project').addEventListener('click',() => show(current - 1));
  $('#next-project').addEventListener('click',() => show(current + 1));
  visual.addEventListener('keydown',(event) => {
    if (inside) return;
    if (event.key === 'ArrowLeft') { event.preventDefault();show(current - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault();show(current + 1); }
  });
  visual.addEventListener('touchstart',(event) => {
    if (event.touches.length === 1) touchStart = {x:event.touches[0].clientX,y:event.touches[0].clientY};
  },{passive:true});
  visual.addEventListener('touchend',(event) => {
    if (!touchStart || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX-touchStart.x;
    const dy = event.changedTouches[0].clientY-touchStart.y;
    if (Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.25) show(current + (dx<0?1:-1));
    touchStart = null;
  },{passive:true});

  function setStartRect() {
    const box = visual.getBoundingClientRect();
    shell.style.left = `${box.left}px`;
    shell.style.top = `${box.top}px`;
    shell.style.width = `${box.width}px`;
    shell.style.height = `${box.height}px`;
    shell.style.setProperty('--portal-rim',`${Math.max(8,window.metalLayout?.rim || 12)}px`);
    shell.style.setProperty('--portal-radius',getComputedStyle(visual).borderTopLeftRadius);
  }

  function showFailure() {
    if (!inside) return;
    errorBox.hidden = false;
    portalImage.classList.remove('is-loaded');
  }

  function enterSite(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (inside) return;
    const project = projects[current];
    if (!project?.url) return;
    inside = true;
    closing = false;
    const thisToken = ++token;
    errorBox.hidden = true;
    portalImage.classList.remove('is-loaded');
    portalImage.hidden = !project.image;
    if (project.image) portalImage.src = project.image;
    screen.querySelector('.project-placeholder')?.remove();
    if (!project.image) screen.append(slideFor(project));
    external.href = errorLink.href = project.url;
    setStartRect();
    const iframe = document.createElement('iframe');
    iframe.title = `Strona: ${project.label}`;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer';
    iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups');
    iframe.src = project.url;
    iframe.addEventListener('load',() => {
      if (thisToken !== token || !inside) return;
      clearTimeout(timeout);
      portalImage.classList.add('is-loaded');
      screen.querySelector('.project-placeholder')?.remove();
    },{once:true});
    screen.prepend(iframe);
    timeout = setTimeout(showFailure,6000);
    shell.classList.add('is-active');
    backdrop.classList.add('is-active');
    shell.setAttribute('aria-hidden','false');
    document.body.classList.add('inside-site');
    visual.inert = true;
    $('#portal-back').focus();
    priorState = history.state;
    priorUrl = location.href;
    history.pushState({protoInside:true,token:thisToken},'',`#projekt-${project.id || current + 1}`);
    requestAnimationFrame(() => requestAnimationFrame(() => shell.classList.add('is-full')));
  }

  function exitSite() {
    if (!inside || closing) return;
    closing = true;
    inside = false;
    token++;
    clearTimeout(timeout);
    setStartRect();
    shell.classList.remove('is-full');
    backdrop.classList.remove('is-active');
    const finish = () => {
      shell.classList.remove('is-active');
      shell.setAttribute('aria-hidden','true');
      screen.querySelector('iframe')?.remove();
      screen.querySelector('.project-placeholder')?.remove();
      portalImage.removeAttribute('src');
      document.body.classList.remove('inside-site');
      visual.inert = false;
      if (!enter.hidden) enter.focus(); else visual.focus();
      closing = false;
    };
    setTimeout(finish,reduceMotion.matches ? 0 : 920);
  }

  enter.addEventListener('click',enterSite);
  function leaveByControl() {
    const hadEntry = !!history.state?.protoInside;
    exitSite();
    if (hadEntry) {
      history.back();
      setTimeout(() => {if (history.state?.protoInside) history.replaceState(priorState,'',priorUrl);},150);
    }
  }
  $('#portal-back').addEventListener('click',leaveByControl);
  addEventListener('popstate',() => { if (inside && !history.state?.protoInside) exitSite(); });
  document.addEventListener('keydown',(event) => {
    if (inside && event.key === 'Escape') {
      event.preventDefault();
      leaveByControl();
    }
  });
  addEventListener('resize',() => { if (inside && !shell.classList.contains('is-full')) setStartRect(); });

  show(current,false);
  // Hosted previews read the JSON directly; the generated JS is the file:// fallback.
  if (location.protocol !== 'file:') fetch('projects.json').then((response) => {
    if (!response.ok) throw new Error('projects.json');
    return response.json();
  }).then((data) => { if (Array.isArray(data) && data.length) {projects=data;viewport.replaceChildren();show(Math.min(current,data.length-1),false);} }).catch(() => {});
})();
