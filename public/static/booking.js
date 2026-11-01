(() => {
  function update(group) {
    const people = [...group.querySelectorAll('.party-person')];
    people.forEach((person, index) => { person.querySelector('legend').textContent = `Người đi cùng ${index + 1}`; });
    const count = people.filter((person) => person.querySelector('[name="companion_name"]').value.trim()).length + 1;
    group.querySelector('[data-party-count]').textContent = `Đăng ký cho ${count} người, gồm người liên hệ chính.`;
    group.querySelector('[data-add-companion]').disabled = people.length >= 19;
  }
  document.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add-companion]');
    const remove = event.target.closest('[data-remove-companion]');
    const group = (add || remove)?.closest('.party-fields');
    if (!group) return;
    if (remove) {
      const person = remove.closest('.party-person');
      if (group.querySelectorAll('.party-person').length === 1) {
        person.querySelectorAll('input').forEach((field) => { field.value = ''; });
        person.querySelector('select').value = 'unspecified';
      } else person.remove();
    } else if (group.querySelectorAll('.party-person').length < 19) {
      const person = group.querySelector('.party-person').cloneNode(true);
      person.querySelectorAll('input').forEach((field) => { field.value = ''; });
      person.querySelector('select').value = 'unspecified';
      group.querySelector('[data-party-list]').append(person);
      person.querySelector('input').focus();
    }
    update(group);
  });
  document.addEventListener('input', (event) => {
    const group = event.target.closest('.party-fields');
    if (group) update(group);
  });
  document.querySelectorAll('.party-fields').forEach(update);
})();
