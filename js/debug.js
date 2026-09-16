export function setupDebug(onReset) {
  const panel = document.getElementById('debug');
  const forced = document.getElementById('forced');
  const toggle = () => { panel.hidden = !panel.hidden; };
  if (new URLSearchParams(location.search).get('debug') === '1') panel.hidden = false;
  document.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'd' && !['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) toggle();
  });
  document.getElementById('reset').addEventListener('click', onReset);
  return () => panel.hidden ? '' : forced.value;
}
