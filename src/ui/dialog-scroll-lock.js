// Freeze the page at its current position while the dialog's own content scrolls.
export function createDialogScrollLock(dialog, win = window, doc = document) {
  let saved = null;
  const properties = ['position', 'top', 'left', 'right', 'width'];
  function lock() {
    if (saved) return;
    const root = doc.documentElement,
      body = doc.body;
    saved = {
      x: win.scrollX,
      y: win.scrollY,
      overflow: root.style.getPropertyValue('overflow'),
      overflowPriority: root.style.getPropertyPriority('overflow'),
      body: properties.map((key) => [
        key,
        body.style.getPropertyValue(key),
        body.style.getPropertyPriority(key),
      ]),
    };
    root.dataset.homeScrollLocked = 'true';
    root.style.overflow = 'hidden';
    Object.assign(body.style, {
      position: 'fixed',
      top: `-${saved.y}px`,
      left: `-${saved.x}px`,
      right: '0',
      width: '100%',
    });
  }
  function unlock() {
    if (!saved) return;
    const restore = saved;
    saved = null;
    if (restore.overflow)
      doc.documentElement.style.setProperty('overflow', restore.overflow, restore.overflowPriority);
    else doc.documentElement.style.removeProperty('overflow');
    delete doc.documentElement.dataset.homeScrollLocked;
    for (const [key, value, priority] of restore.body)
      if (value) doc.body.style.setProperty(key, value, priority);
      else doc.body.style.removeProperty(key);
    win.scrollTo(restore.x, restore.y);
    win.dispatchEvent(new Event('resize'));
  }
  dialog.addEventListener('close', unlock);
  const observer = new win.MutationObserver(() => (dialog.open ? lock() : unlock()));
  observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  return {
    open() {
      lock();
      try {
        dialog.showModal();
      } catch (error) {
        unlock();
        throw error;
      }
    },
  };
}
