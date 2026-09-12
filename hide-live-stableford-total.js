/* Remove selected summary/actions from Live Scoring display only. */
(() => {
  function cleanLiveScoring(){
    document.querySelectorAll('#app *').forEach(el=>{
      const text=(el.textContent||'').trim();
      if(text.startsWith('Stableford round total:')){
        const box=el.closest('.callout,.notice,.card')||el;
        box.remove();
        return;
      }
      if(text==='View Side Game Results'){
        const button=el.closest('button,a')||el;
        button.remove();
      }
    });
  }

  const prior=render;
  render=function(){
    prior();
    setTimeout(cleanLiveScoring,0);
  };

  setTimeout(cleanLiveScoring,0);
})();
