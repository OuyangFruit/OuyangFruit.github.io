const segments = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abfgcd'
};
const order = 'abcdefg';

export function renderSevenSegment(element, value, digits) {
  const display = String(Math.max(0, Number(value) || 0)).padStart(digits, '0').slice(-digits);
  if (element.dataset.ledValue === display) return;
  element.dataset.ledValue = display;
  element.setAttribute('aria-label', display);
  element.innerHTML = [...display].map(number => {
    const active = segments[number] || '';
    return `<span class="digit" aria-hidden="true">${[...order].map(part => `<i class="segment ${part}${active.includes(part) ? ' on' : ''}"></i>`).join('')}</span>`;
  }).join('');
}
