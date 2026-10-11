(function () {
  'use strict';

  var cleanups = new WeakMap();
  var variants = [
    { id: 'grid', label: 'Siatka' },
    { id: 'bento', label: 'Bento' },
    { id: 'strip', label: 'Pas' }
  ];

  function element(tag, className, content) {
    var node = document.createElement(tag);
    node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

  function appendLink(parent, project) {
    if (!project.url) return;
    var link = element('a', 'pv-link', 'Zobacz stronę');
    link.href = project.url;
    link.target = '_blank';
    link.rel = 'noopener';
    parent.appendChild(link);
  }

  function appendCopy(parent, project, includeTitle, includeDescription) {
    if (includeTitle) parent.appendChild(element('h3', 'pv-title', project.label));
    if (project.status) parent.appendChild(element('p', 'pv-status', project.status));
    if (includeDescription && project.description) {
      parent.appendChild(element('p', 'pv-description', project.description));
    }
    appendLink(parent, project);
  }

  function card(project, id, base, index) {
    var article = element('article', 'pv-card' + (project.image ? '' : ' pv-card-text'));
    article.dataset.projectIndex = String(index + 1);
    var media = element('div', 'pv-media' + (project.image ? '' : ' pv-metal'));
    article.appendChild(media);

    if (project.image) {
      var img = element('img', 'pv-image');
      img.src = base + project.image;
      img.alt = 'Podgląd projektu: ' + project.label;
      img.loading = 'lazy';
      media.appendChild(img);
    } else if (id === 'strip') {
      var label = element('span', 'pv-metal-title', project.label);
      label.setAttribute('aria-hidden', 'true');
      media.appendChild(label);
    } else {
      media.appendChild(element('h3', 'pv-metal-title', project.label));
      var metalCopy = element('div', 'pv-metal-copy');
      if (project.description) {
        metalCopy.appendChild(element('p', 'pv-description', project.description));
      }
      if (id === 'bento') appendCopy(metalCopy, project, false, false);
      media.appendChild(metalCopy);
    }

    if (project.image || id !== 'bento') {
      var caption = element('div', 'pv-caption');
      appendCopy(caption, project, Boolean(project.image) || id === 'strip',
        Boolean(project.image) || id === 'strip');
      article.appendChild(caption);
    }
    return article;
  }

  function attachStrip(mount, row) {
    var track = element('div', 'pv-progress');
    track.setAttribute('aria-hidden', 'true');
    var fill = element('span', 'pv-progress-fill');
    track.appendChild(fill);
    mount.appendChild(track);

    function updateProgress() {
      var distance = row.scrollWidth - row.clientWidth;
      var progress = distance > 0 ? row.scrollLeft / distance : 1;
      fill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, progress)) + ')';
    }

    function onKeydown(event) {
      if (event.target !== row || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        row.scrollTo({ left: event.key === 'Home' ? 0 : row.scrollWidth, behavior: 'auto' });
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      var first = row.firstElementChild;
      var gap = parseFloat(window.getComputedStyle(row).columnGap) || 0;
      var step = first ? first.getBoundingClientRect().width + gap : row.clientWidth;
      row.scrollBy({
        left: event.key === 'ArrowRight' ? step : -step,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
      });
    }

    row.addEventListener('scroll', updateProgress, { passive: true });
    row.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', updateProgress, { passive: true });
    var observer = null;
    if (window.ResizeObserver) {
      observer = new ResizeObserver(updateProgress);
      observer.observe(row);
      Array.prototype.forEach.call(row.children, function (child) { observer.observe(child); });
    }
    updateProgress();
    cleanups.set(mount, function () {
      row.removeEventListener('scroll', updateProgress);
      row.removeEventListener('keydown', onKeydown);
      window.removeEventListener('resize', updateProgress);
      if (observer) observer.disconnect();
    });
  }

  window.ProjectVariants = {
    list: variants,
    render: function (id, mount, projects, base) {
      if (!mount) return;
      var cleanup = cleanups.get(mount);
      if (cleanup) cleanup();
      cleanups.delete(mount);
      if (!variants.some(function (variant) { return variant.id === id; })) id = 'grid';
      mount.replaceChildren();
      mount.className = 'pv pv-' + id;
      var container = mount;
      if (id === 'strip') {
        container = element('div', 'pv-row');
        container.tabIndex = 0;
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', 'Przewijana lista realizacji');
        mount.appendChild(container);
      }
      (projects || []).forEach(function (project, index) {
        container.appendChild(card(project, id, base || '', index));
      });
      if (id === 'strip') attachStrip(mount, container);
    }
  };
}());
