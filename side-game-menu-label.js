/* Menu label only; underlying tab key remains "Side Games". */
(() => {
  const b=document.querySelector('nav button[data-tab="Side Games"]');
  if(b) b.textContent='Side Game Results';
})();
