(function () {
  var b = document.querySelector('[data-print]');
  if (b) b.addEventListener('click', function () { window.print(); });
  if (/[?&]print=1/.test(location.search)) setTimeout(function () { window.print(); }, 600);
})();
