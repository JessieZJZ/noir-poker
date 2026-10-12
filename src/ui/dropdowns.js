// Keep native selects as the state/change interface. All visible interaction
// uses the same anchored list, including selects added by roster/review renders.
export function prepareDropdowns(root = document) {
  const controls = new Map();
  const labels = new WeakMap();
  let sequence = 0;
  let opened = null;
  const close = (restore = false) => {
    if (!opened) return;
    const { button, menu, frame } = opened;
    opened = null;
    if (frame !== undefined) cancelAnimationFrame(frame);
    menu.remove();
    button.setAttribute('aria-expanded', 'false');
    if (restore) button.focus({ preventScroll: true });
  };
  function position() {
    if (!opened) return;
    const { button, menu, count, topLayer } = opened;
    const rect = button.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || !button.isConnected) return close();
    const width = Math.min(innerWidth - 16, Math.max(rect.width, 110));
    const wanted = Math.min(260, count * 36 + 2);
    const below = Math.max(0, innerHeight - rect.bottom - 12);
    const above = Math.max(0, rect.top - 12);
    const upwards = below < Math.min(wanted, 120) && above > below;
    const height = Math.max(36, Math.min(wanted, upwards ? above : below));
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${height}px`;
    const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
    const top = upwards ? rect.top - height - 4 : rect.bottom + 4;
    if (topLayer) {
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    } else {
      // Older WebViews keep fixed children inside a transformed dialog. Measure
      // that containing block rather than adding viewport coordinates twice.
      menu.style.left = '0px';
      menu.style.top = '0px';
      const origin = menu.getBoundingClientRect();
      menu.style.left = `${left - origin.left}px`;
      menu.style.top = `${top - origin.top}px`;
    }
  }
  const sync = (select, button) => {
    const text = select.selectedOptions[0]?.textContent || '';
    if (button.textContent !== text) button.textContent = text;
    button.disabled = select.disabled;
    button.setAttribute(
      'aria-label',
      select.getAttribute('aria-label') ||
        (labels.get(select) || [...(select.labels || [])])
          .map((label) => {
            const text = label.cloneNode(true);
            text
              .querySelectorAll('select, button, .dropdown-control')
              .forEach((element) => element.remove());
            return text.textContent.trim();
          })
          .join(' ') ||
        button.textContent,
    );
    const style = getComputedStyle(select);
    for (const key of [
      'fontSize',
      'fontWeight',
      'fontFamily',
      'lineHeight',
      'padding',
      'borderRadius',
    ])
      button.style[key] = style[key];
  };
  function open(select, button) {
    if (opened?.button === button) return close(true);
    close();
    sync(select, button);
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    menu.id = `${select.id || 'choice'}-options`;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', button.getAttribute('aria-label'));
    const options = [...select.options].filter((option) => !option.hidden);
    options.forEach((option) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'dropdown-option';
      row.dataset.value = option.value;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(option.selected));
      row.disabled = option.disabled;
      row.textContent = option.textContent;
      row.onclick = () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync(select, button);
        close(true);
      };
      menu.append(row);
    });
    (select.closest('dialog[open]') || document.body).append(menu);
    let topLayer = false;
    if (typeof menu.showPopover === 'function') {
      menu.popover = 'manual';
      try {
        menu.showPopover();
        topLayer = true;
      } catch {
        menu.removeAttribute('popover');
      }
    }
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', menu.id);
    opened = { button, menu, count: options.length, topLayer };
    position();
    if (!topLayer) {
      const track = () => {
        if (opened?.menu !== menu) return;
        position();
        if (opened?.menu === menu) opened.frame = requestAnimationFrame(track);
      };
      opened.frame = requestAnimationFrame(track);
    }
    const selected =
      menu.querySelector('[aria-selected="true"]') || menu.querySelector('button:not(:disabled)');
    selected?.focus({ preventScroll: true });
    if (selected) menu.scrollTop = Math.max(0, selected.offsetTop - menu.clientHeight / 2 + 18);
    menu.onkeydown = (event) => {
      const rows = [...menu.querySelectorAll('button:not(:disabled)')];
      const index = rows.indexOf(document.activeElement);
      const next =
        event.key === 'ArrowDown'
          ? Math.min(index + 1, rows.length - 1)
          : event.key === 'ArrowUp'
            ? Math.max(0, index - 1)
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? rows.length - 1
                : null;
      if (next !== null) {
        event.preventDefault();
        rows[next]?.focus({ preventScroll: true });
        if (rows[next]) {
          const top = rows[next].offsetTop;
          if (top < menu.scrollTop) menu.scrollTop = top;
          if (top + 36 > menu.scrollTop + menu.clientHeight)
            menu.scrollTop = top + 36 - menu.clientHeight;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
      if (event.key === 'Tab') close();
    };
  }
  function refresh() {
    for (const [select] of controls) if (!select.isConnected) controls.delete(select);
    for (const select of root.querySelectorAll('select')) {
      if (!controls.has(select)) {
        labels.set(select, [...(select.labels || [])]);
        const wrapper = document.createElement('span');
        wrapper.className = 'dropdown-control';
        select.before(wrapper);
        wrapper.append(select);
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        const button = document.createElement('button');
        button.type = 'button';
        button.id = `${select.id || `choice-${++sequence}`}-trigger`;
        button.className = 'dropdown-trigger';
        button.dataset.select = select.id;
        button.setAttribute('role', 'combobox');
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');
        wrapper.append(button);
        for (const label of labels.get(select)) label.htmlFor = button.id;
        if (select.hasAttribute('aria-describedby'))
          button.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
        button.onclick = () => open(select, button);
        button.onkeydown = (event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            open(select, button);
          }
        };
        select.addEventListener('change', () => sync(select, button));
        controls.set(select, button);
      }
      sync(select, controls.get(select));
    }
    if (opened && !opened.button.isConnected) close();
  }
  const observer = new MutationObserver(refresh);
  observer.observe(root.documentElement || root, { childList: true, subtree: true });
  root.addEventListener(
    'pointerdown',
    (event) => {
      if (opened && !opened.menu.contains(event.target) && !opened.button.contains(event.target))
        close();
    },
    true,
  );
  root.addEventListener(
    'scroll',
    (event) => {
      if (opened && !opened.menu.contains(event.target)) position();
    },
    true,
  );
  root.addEventListener('close', () => close(), true);
  window.addEventListener('resize', () => {
    close();
    refresh();
  });
  refresh();
  return { refresh, close };
}
