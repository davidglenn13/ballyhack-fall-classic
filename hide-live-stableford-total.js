/* Remove Stableford round-total summary from Live Scoring display only. */
(() => {
  function removeStablefordRoundTotal(){
    document.querySelectorAll('#app *').forEach(el=>{
      const text=(el.textContent||'').trim();
      if(!text.startsWith('Stableford round total:'))return;
      const box=el.closest('.callout,.notice,.card')||el;
      box.remove();
    });
  }

  const prior=render;
  render=function(){
    prior();
    setTimeout(removeStablefordRoundTotal,0);
  };

  setTimeout(removeStablefordRoundTotal,0);
})();
