(() => {
  let timer;
  let active;
  let generation = 0;

  async function lookup(form) {
    if (!form.reportValidity()) return;
    clearTimeout(timer);
    active?.abort();
    const controller = new AbortController();
    active = controller;
    const requestGeneration = ++generation;
    const status = form.querySelector('[data-lookup-status]');
    const button = form.querySelector('button');
    status.textContent = 'Đang tìm hồ sơ trong CLB…';
    button.disabled = true;
    try {
      const response = await fetch(form.action, {
        method: 'POST', body: new FormData(form), cache: 'no-store',
        credentials: 'same-origin', signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(response.status === 429
          ? 'Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau một phút.'
          : 'Chưa tra cứu được. Vui lòng nhấn Tiếp tục để thử lại.');
      }
      const html = await response.text();
      if (requestGeneration !== generation) return;
      const next = new DOMParser().parseFromString(html, 'text/html').querySelector('.guest-registration');
      if (!next) throw new Error('Chưa tra cứu được. Vui lòng thử lại.');
      form.closest('.guest-registration').replaceWith(next);
      const target = next.querySelector('input[name="name"]:not([readonly]), [data-confirm-join]') || next;
      target.focus({ preventScroll: true });
    } catch (error) {
      if (error.name !== 'AbortError' && requestGeneration === generation) {
        status.textContent = error.message;
      }
    } finally {
      if (requestGeneration === generation) button.disabled = false;
    }
  }

  document.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-phone-lookup]')) return;
    event.preventDefault();
    lookup(event.target);
  });

  document.addEventListener('input', (event) => {
    const field = event.target;
    if (!field.matches('[data-phone-lookup] input[name="phone"]')) return;
    clearTimeout(timer);
    active?.abort();
    generation++;
    const form = field.form;
    form.querySelector('button').disabled = false;
    form.querySelector('[data-lookup-status]').textContent = '';
    const phone = field.value.replace(/[\s.\-()]/g, '');
    if (/^(?:0[35789]\d{8}|(?:\+84|84)[35789]\d{8}|\+[1-9]\d{8,14})$/.test(phone)) {
      timer = setTimeout(() => lookup(form), 900);
    }
  });
})();
